// DEBUT BLOC (remplace tout)
import { Router, type Request } from 'express';
import { prisma } from '../lib/db.js';
import { getCurrentUserId } from '../lib/currentUser.js';
import {
  CHAT_LIMITS,
  DEFAULT_PLAN,
  type PlanId,
  type ChatLimits,
} from '../config/chatLimits.js';
import { hasSufficientFunds, chargeUser, COSTS } from '../lib/billing-service.js';
import { PlanType } from '@prisma/client';
import { analyzeOutputQuality } from '../lib/semantic-scanner.js';
import { ChatOptions } from '../types/chat.js';
import OpenAI from 'openai';
import { searchSimilarChunks } from '../lib/rag-service.js';
import { logger } from '../lib/logger.js';
import { redis } from '../lib/redis.js';
import { prepareChatAttachment, type PreparedChatAttachment } from '../lib/chat-attachments.js';
import { chatAttachmentUpload } from '../middleware/chat-upload.js';
import { enrichChatSources } from '../lib/chat-source-enrichment.js';
import {
  formatWebSourcesForPrompt,
  generateWebSystemPrompt,
  normalizeWebSearchProfile,
  resolveWebLlmModel,
  sanitizeWebChatMessages,
  searchWebContext,
  isConversationalQuery,
  type WebChatMessage,
  type WebPromptMode,
} from '../lib/web-chat.js';
import { buildAnswerScorePayload } from '../lib/score-helpers.js';

// OpenAI Client for RAG mode (fast)
// Verify API Key availability
if (!process.env.OPENAI_API_KEY) {
  logger.warn("OPENAI_API_KEY missing, RAG mode will fail.");
}
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


// ————————————————————————————————————————————————————————————————
// PROMPTS SYSTEME DYNAMIQUES
// ————————————————————————————————————————————————————————————————
// Web chat now uses Serper for discovery, extractor/RAG for context, and OpenAI for generation/streaming.


// ————————————————————————————————————————————————————————————————
// Helpers limites / plan

function getPlanForUser(_userId: string): PlanId {
  // Currently, everyone is on the FREE plan by default.
  // This will be connected to the User.subscriptionTier field in the future.
  return DEFAULT_PLAN;
}

function getLimitsForUser(userId: string): ChatLimits {
  const planId = getPlanForUser(userId);
  return CHAT_LIMITS[planId];
}

const WEB_RATE_LIMIT_WINDOW_SECONDS = 60;
const WEB_RATE_LIMIT_MAX_REQUESTS = 10;

function getClientIp(req: Request): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0]
      : null;

  const rawIp = forwardedIp || req.ip || req.socket.remoteAddress || 'unknown';
  return rawIp.replace(/^::ffff:/, '').trim();
}

async function enforceWebRateLimit(req: Request): Promise<{ allowed: true } | { allowed: false; retryAfter: number }> {
  const clientIp = getClientIp(req);
  const key = `rate_limit_chat_${clientIp}`;

  try {
    const currentCount = await redis.incr(key);
    if (currentCount === 1) {
      await redis.expire(key, WEB_RATE_LIMIT_WINDOW_SECONDS);
    }

    const ttl = await redis.ttl(key);
    if (currentCount > WEB_RATE_LIMIT_MAX_REQUESTS) {
      return {
        allowed: false,
        retryAfter: ttl > 0 ? ttl : WEB_RATE_LIMIT_WINDOW_SECONDS,
      };
    }
  } catch (error: unknown) {
    logger.warn('Web chat rate limiter unavailable, allowing request', {
      module: 'Chat',
      ip: clientIp,
      error: error instanceof Error ? error.message : 'Unknown Redis error',
    });
  }

  return { allowed: true };
}

function readStringField(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function readBooleanField(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
  }

  return false;
}

function readJsonField<T>(value: unknown): T | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value !== 'string') {
    return value as T;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function buildAttachmentSystemPrompt(attachment: PreparedChatAttachment | null): string | null {
  if (!attachment?.promptText) {
    return null;
  }

  return attachment.promptText;
}

function buildEffectiveUserText(content: string, attachment: PreparedChatAttachment | null): string {
  if (content.trim()) {
    return content.trim();
  }

  if (attachment?.kind === 'pdf') {
    return 'Analyse le document joint.';
  }

  if (attachment?.kind === 'image') {
    return 'Analyse l’image jointe.';
  }

  return '';
}

function buildCurrentUserMessage(
  content: string,
  attachment: PreparedChatAttachment | null,
): OpenAI.Chat.Completions.ChatCompletionUserMessageParam {
  const userText = buildEffectiveUserText(content, attachment);

  if (attachment?.kind === 'image' && attachment.imageDataUrl) {
    return {
      role: 'user',
      content: [
        {
          type: 'text',
          text: userText || 'Analyse l’image jointe.',
        },
        {
          type: 'image_url',
          image_url: {
            url: attachment.imageDataUrl,
          },
        },
      ],
    };
  }

  return {
    role: 'user',
    content: userText,
  };
}

function mapHistoryToOpenAiMessages(
  history: WebChatMessage[],
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return history
    .filter((message) => message.role !== 'system' && message.content.trim())
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

// ————————————————————————————————————————————————————————————————
export const router = Router();

// Helpers
function autoTitleFrom(text: string) {
  const t = text.trim().replace(/\s+/g, ' ');
  return (t.slice(0, 40) + (t.length > 40 ? '…' : '')) || 'New chat';
}

// GET /api/chat/sessions?take=20&cursor=SESSION_ID&folderId=FOLDER_ID
router.get('/sessions', async (req, res, next) => {
  try {
    const userId = await getCurrentUserId(req, res);
    const take = Math.min(
      Math.max(parseInt(String(req.query.take ?? '20'), 10) || 20, 1),
      50,
    );
    const cursor = req.query.cursor ? String(req.query.cursor) : null;
    const folderId = req.query.folderId ? String(req.query.folderId) : null;

    const where: any = { userId };
    if (folderId) where.folderId = folderId;

    const rows = await prisma.chatSession.findMany({
      where,
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        topic: true,
        createdAt: true,
        updatedAt: true,
        folderId: true,
      },
    });

    const hasMore = rows.length > take;
    res.json({
      items: rows.slice(0, take).map((s) => ({
        id: s.id,
        title: s.topic ?? 'New chat',
        folderId: s.folderId ?? null,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      nextCursor: hasMore ? rows[take - 1].id : null,
    });
  } catch (e) {
    next(e);
  }
});

// POST /api/chat/sessions  { title?, mode?, folderId? }
router.post('/sessions', async (req, res, next) => {
  try {
    const userId = await getCurrentUserId(req, res);
    const limits = getLimitsForUser(userId);
    // 0) petit rate-limit : création de sessions (Maintenant couplé au quota DB)
    // Removed old rate limiter
    // await checkAndIncrement(userId);


    // 1) hard-limit sur le nombre de sessions par utilisateur
    const sessionCount = await prisma.chatSession.count({ where: { userId } });
    if (sessionCount >= limits.maxSessionsPerUser) {
      return res.status(400).json({
        error: 'chat_session_limit_reached',
        message:
          'Tu as atteint le nombre maximum de conversations. Supprime des chats avant d’en créer de nouvelles.',
        limit: limits.maxSessionsPerUser,
        plan: getPlanForUser(userId),
      });
    }

    const title =
      (req.body?.title ? String(req.body.title) : null) ?? 'New chat';
    const mode =
      req.body?.mode && ['fast', 'balanced', 'precise'].includes(req.body.mode)
        ? req.body.mode
        : 'balanced';
    const folderId = req.body?.folderId ? String(req.body.folderId) : null;

    // vérifier ownership du folder si fourni
    if (folderId) {
      const folder = await prisma.chatFolder.findUnique({
        where: { id: folderId },
        select: { userId: true },
      });
      if (!folder || folder.userId !== userId) {
        return res.status(400).json({ error: 'Invalid folderId' });
      }
    }

    const s = await prisma.chatSession.create({
      data: { userId, topic: title, mode, folderId },
      select: {
        id: true,
        topic: true,
        mode: true,
        folderId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(201).json({
      id: s.id,
      title: s.topic ?? 'New chat',
      mode: s.mode,
      folderId: s.folderId,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    });
  } catch (e) {
    next(e);
  }
});

// PATCH /api/chat/sessions/:id  { title?, mode?, folderId? }
router.patch('/sessions/:id', async (req, res, next) => {
  try {
    const userId = await getCurrentUserId(req, res);
    const id = String(req.params.id);

    const session = await prisma.chatSession.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!session) return res.status(404).json({ error: 'Not found' });
    if (session.userId !== userId)
      return res.status(403).json({ error: 'Forbidden' });

    const data: any = {};
    if (req.body?.title) data.topic = String(req.body.title).trim();
    if (
      req.body?.mode &&
      ['fast', 'balanced', 'precise'].includes(req.body.mode)
    ) {
      data.mode = req.body.mode;
    }
    if (req.body?.folderId !== undefined) {
      const folderId = req.body.folderId ? String(req.body.folderId) : null;
      if (folderId) {
        const folder = await prisma.chatFolder.findUnique({
          where: { id: folderId },
          select: { userId: true },
        });
        if (!folder || folder.userId !== userId) {
          return res.status(400).json({ error: 'Invalid folderId' });
        }
      }
      data.folderId = folderId;
    }
    data.updatedAt = new Date();

    const updated = await prisma.chatSession.update({
      where: { id },
      data,
      select: {
        id: true,
        topic: true,
        mode: true,
        folderId: true,
        updatedAt: true,
      },
    });

    res.json({
      id: updated.id,
      title: updated.topic ?? 'New chat',
      mode: updated.mode,
      folderId: updated.folderId,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (e) {
    next(e);
  }
});

// DELETE /api/chat/sessions/:id
router.delete('/sessions/:id', async (req, res, next) => {
  try {
    const userId = await getCurrentUserId(req, res);
    const id = String(req.params.id);
    const s = await prisma.chatSession.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!s) return res.status(404).json({ error: 'Not found' });
    if (s.userId !== userId)
      return res.status(403).json({ error: 'Forbidden' });

    await prisma.$transaction([
      prisma.chatMessage.deleteMany({ where: { sessionId: id } }),
      // Idempotent delete: returns { count: 0 } if already gone instead of throwing
      prisma.chatSession.deleteMany({ where: { id } }),
    ]);

    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

// GET /api/chat/sessions/:id
router.get('/sessions/:id', async (req, res, next) => {
  try {
    const userId = await getCurrentUserId(req, res);
    const id = String(req.params.id);

    const s = await prisma.chatSession.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        topic: true,
        mode: true,
        folderId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!s) return res.status(404).json({ error: 'Not found' });
    if (s.userId !== userId)
      return res.status(403).json({ error: 'Forbidden' });

    res.json({
      id: s.id,
      title: s.topic ?? 'New chat',
      mode: s.mode,
      folderId: s.folderId,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/chat/sessions/:id/messages?take=30&cursor=MESSAGE_ID
router.get('/sessions/:id/messages', async (req, res, next) => {
  try {
    const userId = await getCurrentUserId(req, res);
    const sessionId = String(req.params.id);
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.userId !== userId)
      return res.status(403).json({ error: 'Forbidden' });

    const take = Math.min(
      Math.max(parseInt(String(req.query.take ?? '30'), 10) || 30, 1),
      100,
    );
    const cursor = req.query.cursor ? String(req.query.cursor) : null;

    const rows = await prisma.chatMessage.findMany({
      where: { sessionId },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'asc' },

      select: { id: true, role: true, content: true, sources: true, metadata: true, createdAt: true } as any, // Cast temporaire (Prisma stale)
    });

    const hasMore = rows.length > take;
    res.json({
      items: rows.slice(0, take).map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        sources: m.sources,
        metadata: m.metadata,
        createdAt: m.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? rows[take - 1].id : null,
    });
  } catch (e) {
    next(e);
  }
});

// POST /api/chat/sessions/:id/messages  { content }
// POST /api/chat/sessions/:id/messages  { content }
router.post('/sessions/:id/messages', chatAttachmentUpload, async (req, res, next) => {
  try {
    const userId = await getCurrentUserId(req, res);
    const limits = getLimitsForUser(userId);
    const sessionId = String(req.params.id);
    const content = String(req.body?.content ?? '').trim();
    const attachment = await prepareChatAttachment(req.file);

    // 🔒 0) vérifier que l'email est vérifié
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        emailVerified: true,
        subscriptionTier: true,
        dailyQueryCount: true,
        role: true,
        usage: {
          select: { plan: true } // Need plan for routing
        }
      },
    });

    if (!user || !user.emailVerified) {
      return res.status(403).json({
        error: 'EMAIL_NOT_VERIFIED',
        message: 'You must verify your email to use the chat.',
      });
    }

    // 🔒 0ter) VÉRIFICATION DU QUOTA (Nouveau système Billing Service)
    // Removed old rate limiter check
    // const usage = await checkAndIncrement(userId);

    // 1) vérification basique
    if (!content && !attachment) {
      return res.status(400).json({
        error: 'content_required',
        message: 'Le message ne peut pas être vide.',
      });
    }

    // 2) limite de taille (plan)
    if (content.length > limits.maxMessageChars) {
      return res.status(400).json({
        error: 'message_too_long',
        message: `Le message est trop long (>${limits.maxMessageChars} caractères pour ton plan). Raccourcis ou envoie-le en plusieurs parties.`,
        limit: limits.maxMessageChars,
        plan: getPlanForUser(userId),
      });
    }

    // 3) hard-limit sur le nombre total de messages pour cet utilisateur (plan)
    const totalMessages = await prisma.chatMessage.count({ where: { userId } });
    if (totalMessages >= limits.maxMessagesPerUser) {
      return res.status(400).json({
        error: 'message_limit_reached',
        message:
          'Tu as atteint le nombre maximum de messages. Supprime des conversations avant de continuer.',
        limit: limits.maxMessagesPerUser,
        plan: getPlanForUser(userId),
      });
    }

    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, topic: true, mode: true },
    });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.userId !== userId)
      return res.status(403).json({ error: 'Forbidden' });

    // 4) Déterminer le mode avant tout appel coûteux ou écriture DB
    const requestedMode = req.body.mode || session.mode || 'web';
    const mode = (requestedMode === 'fast') ? 'fast' : 'web';

    if (mode === 'web') {
      const rateLimit = await enforceWebRateLimit(req);
      if (!rateLimit.allowed) {
        res.setHeader('Retry-After', String(rateLimit.retryAfter));
        return res.status(429).json({
          error: 'RATE_LIMITED',
          message: 'Trop de requêtes Web. Réessaie dans une minute.',
          retryAfter: rateLimit.retryAfter,
        });
      }
    }

    const previousHistoryData = await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { role: true, content: true },
    });

    const attachmentMetadata = attachment
      ? {
          attachments: [
            {
              ...attachment.summary,
            },
          ],
        }
      : undefined;

    // 5) store user message
    const userMsg = await prisma.chatMessage.create({
      data: {
        sessionId,
        userId,
        role: 'user',
        content,
        metadata: attachmentMetadata,
      } as any,
      select: { id: true, createdAt: true },
    });

    // 6) Fetch history context (last 10 messages before current one)
    const history: WebChatMessage[] = previousHistoryData
      .reverse()
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    logger.debug(`User Content received: "${content.substring(0, 100)}..."`, {
      module: 'Chat',
      historyLength: history.length,
      sessionId
    });

    // ---------------------------------------------------------
    // 🧠 SMART ROUTER & BILLING GATE
    // ---------------------------------------------------------
    let actionType: keyof typeof COSTS;
    let modelName: string;
    let webProfile = normalizeWebSearchProfile(readStringField(req.body?.model));

    const userPlan = user.usage?.plan || PlanType.FREE;

    if (mode === 'fast') {
      actionType = 'CHAT_FAST';
      modelName = 'gpt-4o-mini';
    } else {
      const wantsDeepWeb = readStringField(req.body?.model) === 'sonar-pro' && userPlan === PlanType.PREMIUM;
      webProfile = wantsDeepWeb ? 'deep' : 'standard';

      if (wantsDeepWeb) {
        actionType = 'CHAT_WEB_DEEP';
        modelName = resolveWebLlmModel(webProfile);
      } else {
        actionType = 'CHAT_WEB_STANDARD';
        modelName = resolveWebLlmModel(webProfile);
      }
    }

    // 💰 BILLING CHECK (Phase A: Check)
    // Read-only check. Returns 402 if insufficient funds.
    const hasCredits = await hasSufficientFunds(userId, actionType);
    if (!hasCredits) {
      const cost = COSTS[actionType];
      if (actionType.includes('WEB')) {
        return res.status(402).json({
          error: "Quota Web épuisé. Passez en mode Eco.",
          code: "QUOTA_WEB",
          fallbackMode: "fast"
        });
      }
      return res.status(402).json({
        error: "Crédits épuisés pour aujourd'hui.",
        code: "QUOTA_TOTAL"
      });
    }

    // Prepare Streaming Headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.flushHeaders?.();

    const writeSseEvent = (payload: Record<string, unknown>) => {
      try {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        (res as any).flush?.();
        return true;
      } catch (_) {
        return false;
      }
    };

    const writeTextEvent = (contentChunk: string) => {
      if (!contentChunk) {
        return false;
      }

      return writeSseEvent({ type: 'text', content: contentChunk });
    };

    // 6) Variables pour stocker la réponse
    let rawAnswer = "";
    let sources: any[] = [];
    const attachmentSystemPrompt = buildAttachmentSystemPrompt(attachment);
    const currentUserMessage = buildCurrentUserMessage(content, attachment);
    const effectiveQuery = content || attachment?.searchText || buildEffectiveUserText(content, attachment);

    // DEBUG: Trace mode execution
    logger.info(`Starting Chat Generation`, { module: 'Chat', mode, userId, sessionId });
    let finalGlobalScore = 0;
    let outputAnalysis: any = null;
    let sourcesMean = 0;
    let outputScore = 0;
    let shouldCharge = true;

    // =========================================================================
    // CAS 1: MODE FAST (RAG + OpenAI GPT-4o-mini)
    // =========================================================================
    if (mode === 'fast') {
      // ... (Existing RAG Logic - keeping it awaiting for now but could be streamed later)
      // For consistency with the request "Check -> Service -> Settlement", we keep the current blocking logic here
      // BUT we need to support the "Settlement" phase at the end.
      // The current web flow streams from our in-house web search pipeline.
      // To avoid complexity, we keep RAG as is (it's fast/cheap) but apply charge at the end.

      // ... (Rest of RAG Logic is below, I will just wrap the charge call)
      logger.info('Mode FAST active', { module: 'Chat', strategy: 'RAG+OpenAI', userId, sessionId });

      // 1. Récupérer le contexte RAG
      const contextChunks = effectiveQuery
        ? await searchSimilarChunks(effectiveQuery, 5)
        : [];
      logger.debug(`RAG Context found`, { module: 'Chat', count: contextChunks.length });

      // 2. Construire le System Prompt
      const contextString = contextChunks.map((chunk, index) => `
[SOURCE ${index + 1}]
Titre: "${chunk.articleTitle}"
Slug: "${chunk.articleSlug}"
Contenu: ${chunk.content}
`).join('\n\n');

      const systemPrompt = `Tu es Epion, un assistant expert en analyse d'information et fact-checking.
Utilise le CONTEXTE suivant provenant de la base de connaissances interne pour répondre.

--- CONTEXTE INTERNE START ---
${contextChunks.length > 0 ? contextString : '(Aucun contexte pertinent trouvé dans la base de connaissances)'}
--- CONTEXTE INTERNE END ---

${attachmentSystemPrompt ? `${attachmentSystemPrompt}\n\n` : ''}

CONSIGNES DE RÉPONSE :
1. Réponds UNIQUEMENT sur la base des SOURCES fournies ci-dessus.
2. Si la réponse n'est pas dans le contexte, dis-le poliment et propose une recherche web (mode 'Web').
3. CITATIONS OBLIGATOIRES : À chaque fois que tu utilises une information, tu DOIS citer la source à la fin de la phrase en utilisant le format Markdown suivant :
   **[Titre de l'article](/article/slug-de-l-article)**
4. Ne cite jamais de sources externes, cite uniquement les articles Epion fournis en contexte.
5. Sois concis et structuré.`;

      // 3. Construire les messages pour OpenAI
      const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...mapHistoryToOpenAiMessages(history),
        currentUserMessage,
      ];

      // 4. Appel OpenAI pour la reponse RAG interne
      try {
        const openaiResponse = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: openaiMessages,
          temperature: 0.1,
          max_tokens: 2048,
        });

        rawAnswer = openaiResponse.choices[0].message.content || '';

        // CRITICAL FIX: Stream the blocked response to the client
        if (rawAnswer) {
          writeTextEvent(rawAnswer);
        } else {
          logger.warn("OpenAI returned empty content");
        }

      } catch (err: any) {
        logger.error("RAG OpenAI Error", { error: err.message });
        // Ensure we don't crash, let the validation at the end handle the empty answer
      }

      // Mode RAG: citation-based sourcing score
      outputAnalysis = analyzeOutputQuality(rawAnswer);

      const answerResult = buildAnswerScorePayload({
        sourcesMean: 0,
        outputScore: outputAnalysis.score,
        mode: 'fast',
        hasRagChunks: contextChunks.length > 0,
        outputAnalysis,
      });
      outputScore = outputAnalysis.score;
      finalGlobalScore = answerResult.score ?? 0;

      // Sources = Deduplicated internal sources used in context
      const uniqueSources = new Map();
      contextChunks.forEach((chunk) => {
        if (!uniqueSources.has(chunk.articleSlug)) {
          uniqueSources.set(chunk.articleSlug, {
            id: uniqueSources.size + 1,
            name: chunk.articleTitle,
            domain: 'epion.io', // Internal signature
            url: `/article/${chunk.articleSlug}`,
            type: 'KNOWLEDGE_BASE',
            score: 95,
            confidence: 'HIGH',
            justification: 'Source interne vérifiée.',
            description: 'Article de la base de connaissances Epion.',
            chunksUsed: 1
          });
        }
      });
      sources = Array.from(uniqueSources.values());
    } else {
      // =========================================================================
      // CAS 2: MODE WEB (Serper + OpenAI streaming) - Phase B: Service
      // =========================================================================
      logger.info('Mode WEB active (Stream)', {
        module: 'Chat',
        strategy: 'SerperPlusOpenAI',
        userId,
        sessionId,
        modelName,
        webProfile,
      });

      const chatOptions: ChatOptions = {
        filterSources: readBooleanField(req.body?.sourceRestricted),
        forceNeutrality: readBooleanField(req.body?.neutralityForced),
        recentEvents: readBooleanField(req.body?.timeRecent)
      };

      const promptMode: WebPromptMode =
          readStringField(req.body?.responseStyle) === 'concise'
            ? 'fast'
            : readStringField(req.body?.responseStyle) === 'detailed'
              ? 'precise'
              : 'balanced';

      // Phase 1: Web search (must complete before LLM prompt + enrichment)
      let webContext: Awaited<ReturnType<typeof searchWebContext>> = {
        promptSources: [],
        allSources: [],
        dedupedCount: 0,
      };
      try {
        writeSseEvent({ type: 'status', message: 'Analyse de votre question...' });
        webContext = await searchWebContext(effectiveQuery, {
          profile: webProfile,
          chatOptions,
          onProgress: (msg) => {
            writeSseEvent({ type: 'status', message: msg });
          }
        });
      } catch (searchErr: any) {
        logger.error('Web search failed', {
          module: 'Chat',
          error: searchErr.message,
          userId,
          sessionId,
        });
      }

      const conversationalTurn = isConversationalQuery(effectiveQuery) && !attachment;
      const promptSources = webContext.promptSources;
      const allWebSources = webContext.allSources;

      if (allWebSources.length === 0) {
        shouldCharge = false;
      }

      if (!writeSseEvent({
        type: 'sources_pending',
        sources: allWebSources,
        dedupedCount: webContext.dedupedCount,
      })) {
        logger.debug('Client disconnected before pending sources could be sent', { userId });
      }

      // Phase 2: Fire enrichment in background (decoupled from LLM stream)
      writeSseEvent({ type: 'status', message: 'Vérification des sources...' });
      logger.info('Starting enrichment pipeline', {
        module: 'Chat',
        promptSourceCount: promptSources.length,
        webSourceCount: allWebSources.length,
        dedupedCount: webContext.dedupedCount,
        domains: allWebSources.map(s => s.domain)
      });
      const enrichmentPromise = enrichChatSources(allWebSources, {
        priorityDomains: promptSources.map((source) => source.domain),
        maxConcurrent: 6,
        timeoutMs: 80_000,
        onSourceEnriched: (enrichedSource) => {
          if (!writeSseEvent({
            type: 'source_enriched',
            source: enrichedSource,
          })) {
            logger.debug('Client disconnected before progressive enrichment event could be sent', { userId });
          }
        },
      }).catch((err) => {
        logger.error('Enrichment pipeline failed', {
          module: 'Chat',
          error: err instanceof Error ? err.message : 'Unknown enrichment error',
          stack: err instanceof Error ? err.stack : undefined,
          userId,
          sessionId,
        });
        return null;
      });

      // Phase 3: Build prompt & stream LLM response in parallel with enrichment
      const fallbackNotice = allWebSources.length === 0 && !conversationalTurn
        ? `\n\nAucune source externe ou interne n'a pu etre recuperee pour cette question.
Reponds quand meme avec prudence en t'appuyant sur la conversation`
          + `${attachment ? ' et la piece jointe fournie' : ''}.`
          + ` Signale explicitement l'absence de corroboration web.`
        : '';

      const systemInstruction = `${generateWebSystemPrompt(promptMode, chatOptions)}

${attachmentSystemPrompt ? `${attachmentSystemPrompt}\n\n` : ''}${fallbackNotice}

Use the following live web search context for the current question.

${formatWebSourcesForPrompt(promptSources)}`;

      const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemInstruction },
        ...mapHistoryToOpenAiMessages(sanitizeWebChatMessages(history)),
        currentUserMessage,
      ];

      const buildFallbackSources = () =>
        allWebSources.map((s, i) => {
          const provider = s.provider === 'rag' ? 'rag' as const : 'serper' as const;
          const category = provider === 'rag' ? 'DATABASE' : 'MEDIA';
          const fallbackDescription = s.metaDescription || "Media independant en cours d'analyse.";

          return {
            id: i + 1,
            name: s.title || s.domain,
            domain: s.domain,
            url: s.url,
            logo: `https://www.google.com/s2/favicons?domain=${s.domain}&sz=64`,
            category,
            type: category,
            score: Math.max(30, Math.min(100, Math.round(s.score * 100))),
            trustScore: Math.max(30, Math.min(100, Math.round(s.score * 100))),
            confidence: 'MEDIUM' as const,
            description: fallbackDescription,
            justification: provider === 'rag'
              ? `Source interne Epion issue du RAG, rattachee au media ${s.domain}.`
              : `Source web issue de Serper sur ${s.domain}.`,
            dbScore: 50,
            metadata: {
              provider,
              publishedDate: s.publishedDate,
              searchScore: s.score,
              dbScore: 50,
              type: category,
            },
          };
        });

      const writeEnrichmentEvent = (payloadSources: any[], payloadSourcesMean: number) => {
        if (!writeSseEvent({
          type: 'enrichment',
          sources: payloadSources,
          sourcesMean: payloadSourcesMean,
          dedupedCount: webContext.dedupedCount,
        })) {
          logger.debug('Client disconnected before enrichment event could be sent', { userId });
        }
      };

      const resolveEnrichmentPayload = async (): Promise<{ sources: any[]; sourcesMean: number }> => {
        const enrichmentResult = await enrichmentPromise;

        if (enrichmentResult) {
          logger.info('Enrichment succeeded', {
            module: 'Chat',
            sourceCount: enrichmentResult.sources.length,
            sourcesMean: enrichmentResult.sourcesMean,
            dedupedCount: webContext.dedupedCount,
          });

          return {
            sources: enrichmentResult.sources,
            sourcesMean: enrichmentResult.sourcesMean,
          };
        }

        const fallbackSources = buildFallbackSources();
        const fallbackScores = fallbackSources
          .map((source: any) => source.trustScore)
          .filter((score: any) => typeof score === 'number');
        const fallbackSourcesMean = fallbackScores.length > 0
          ? Math.round(fallbackScores.reduce((a: number, b: number) => a + b, 0) / fallbackScores.length)
          : 50;

        logger.warn('Enrichment unavailable, using fallback sources for DB', {
          module: 'Chat',
          userId,
          sessionId,
          fallbackSourceCount: fallbackSources.length,
          fallbackSourcesMean,
          dedupedCount: webContext.dedupedCount,
        });

        return {
          sources: fallbackSources,
          sourcesMean: fallbackSourcesMean,
        };
      };

      try {
        writeSseEvent({ type: 'status', message: 'Synthèse des informations...' });
        // Stream LLM response to client
        const llmStream = await openai.chat.completions.create({
          model: modelName,
          messages: openaiMessages,
          temperature: 0.1,
          max_tokens: webProfile === 'deep' ? 2400 : 1600,
          stream: true,
        });

        for await (const chunk of llmStream) {
          const delta = chunk.choices[0]?.delta?.content || '';
          if (!delta) continue;

          rawAnswer += delta;
          if (!writeTextEvent(delta)) {
            logger.debug('Client disconnected during stream', { userId });
          }
        }

        // After LLM stream completes, await enrichment with a longer timeout budget
        // Prevents the response from hanging if enrichment is abnormally slow
        const enrichmentPayload = await resolveEnrichmentPayload();
        sources = enrichmentPayload.sources;
        sourcesMean = enrichmentPayload.sourcesMean;
        writeEnrichmentEvent(sources, sourcesMean);

      } catch (err: any) {
        logger.error('Web chat pipeline failed', {
          module: 'Chat',
          error: err.message,
          userId,
          sessionId,
        });
        try {
          const enrichmentPayload = await resolveEnrichmentPayload();
          sources = enrichmentPayload.sources;
          sourcesMean = enrichmentPayload.sourcesMean;
          writeEnrichmentEvent(sources, sourcesMean);
        } catch (enrichmentError: any) {
          logger.warn('Failed to resolve enrichment payload after stream error', {
            module: 'Chat',
            userId,
            sessionId,
            error: enrichmentError?.message || 'Unknown enrichment fallback error',
          });
        }
        if (!rawAnswer) {
          rawAnswer = "Le mode web est temporairement indisponible.";
          if (!writeTextEvent(rawAnswer)) {
            logger.debug('Client disconnected before fallback message could be written', { userId });
          }
        }
        shouldCharge = false;
      }

      outputAnalysis = analyzeOutputQuality(rawAnswer);

      const webAnswerPayload = buildAnswerScorePayload({
        sourcesMean,
        outputScore: outputAnalysis.score,
        mode: 'web',
        hasRagChunks: false,
        outputAnalysis,
      });
      outputScore = outputAnalysis.score;
      finalGlobalScore = webAnswerPayload.score ?? 0;
    }

    // =========================================================================
    // SAUVEGARDE & SETTLEMENT (Phase C)
    // =========================================================================

    // Only proceed if we have a valid answer
    if (!rawAnswer || rawAnswer.trim().length === 0) {
      logger.warn("AI Response too short or failed, no charge applied.", { userId, length: rawAnswer?.length });
      // Don't charge. Stream will be closed by the finally block.
      return;
    }

    // Save to DB
    const answerPayload = buildAnswerScorePayload({
      sourcesMean,
      outputScore,
      mode: mode as 'fast' | 'web',
      hasRagChunks: mode === 'fast' && sources.length > 0,
      outputAnalysis,
    });

    const aiMsg = await prisma.chatMessage.create({
      data: {
        sessionId,
        role: 'assistant',
        content: rawAnswer,
        sources: sources,
        metadata: answerPayload,
      } as any,
      select: { id: true, content: true, sources: true, metadata: true, createdAt: true } as any,
    }) as any;

    // 💰 CHARGE USER (Phase C: Settlement)
    if (shouldCharge) {
      try {
        await chargeUser(userId, actionType);
        logger.info('User charged successfully', { userId, action: actionType, cost: COSTS[actionType] });
      } catch (error: any) {
        logger.error('CRITICAL: Charge failed after AI delivery', {
          userId,
          error: error.message
        });
      }
    } else {
      logger.info('User not charged because web search context or generation was incomplete', {
        module: 'Chat',
        userId,
        action: actionType,
      });
    }

    return;
  } catch (e) {
    next(e);
  } finally {
    // Précision 2: stream is ALWAYS closed, even if an error is thrown
    // anywhere in the pipeline (OpenAI timeout, DB failure, etc.)
    try {
      if (!res.writableEnded) {
        res.end();
      }
    } catch (_) { /* response already destroyed */ }
  }
});

// FIN BLOC
