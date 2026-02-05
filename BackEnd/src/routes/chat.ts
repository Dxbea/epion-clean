// DEBUT BLOC (remplace tout)
import { Router } from 'express';
import { prisma } from '../lib/db';
import { getCurrentUserId } from '../lib/currentUser';
import {
  CHAT_LIMITS,
  DEFAULT_PLAN,
  type PlanId,
  type ChatLimits,
} from '../config/chatLimits';
import { checkAndChargeUser, hasSufficientFunds, chargeUser, COSTS } from '../lib/billing-service';
import { PlanType } from '@prisma/client';
import { callPerplexity, streamPerplexity, type PerplexityMessage, generateSystemPrompt } from '../lib/perplexity';
import { getRichTrustScore } from '../lib/trust-score';
import { analyzeOutputQuality } from '../lib/semantic-scanner';
import { AI_MODELS } from '../config/ai-models';
import { ChatOptions } from '../types/chat';
import OpenAI from 'openai';
import { searchSimilarChunks, type SearchResult } from '../lib/rag-service';
import { logger } from '../lib/logger';

// OpenAI Client for RAG mode (fast)
// Verify API Key availability
if (!process.env.OPENAI_API_KEY) {
  logger.warn("OPENAI_API_KEY missing, RAG mode will fail.");
}
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


// ————————————————————————————————————————————————————————————————
// PROMPTS SYSTEME DYNAMIQUES
// ————————————————————————————————————————————————————————————————
// (Fonction getSystemPrompt déplacée dans ../lib/perplexity.ts)


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
router.post('/sessions/:id/messages', async (req, res, next) => {
  try {
    const userId = await getCurrentUserId(req, res);
    const limits = getLimitsForUser(userId);
    const sessionId = String(req.params.id);
    const content = String(req.body?.content ?? '').trim();

    // 🔒 0) vérifier que l'email est vérifié
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        emailVerifiedAt: true,
        subscriptionTier: true,
        dailyQueryCount: true,
        role: true,
        usage: {
          select: { plan: true } // Need plan for routing
        }
      },
    });

    if (!user || !user.emailVerifiedAt) {
      return res.status(403).json({
        error: 'EMAIL_NOT_VERIFIED',
        message: 'You must verify your email to use the chat.',
      });
    }

    // 🔒 0ter) VÉRIFICATION DU QUOTA (Nouveau système Billing Service)
    // Removed old rate limiter check
    // const usage = await checkAndIncrement(userId);

    // 1) vérification basique
    if (!content) {
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
      select: { id: true, userId: true, topic: true },
    });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.userId !== userId)
      return res.status(403).json({ error: 'Forbidden' });

    // 4) store user message
    const userMsg = await prisma.chatMessage.create({
      data: { sessionId, userId, role: 'user', content },
      select: { id: true, createdAt: true },
    });

    // 5) Fetch history context (last 10 messages)
    const historyData = await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: 11, // inclut le message qu'on vient de créer
      select: { role: true, content: true },
    });

    // Remettre dans l'ordre chronologique
    const history: PerplexityMessage[] = historyData
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

    // 0) Récupération du mode (Priorité : Body > Session > Default 'web')
    const sessionData = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { mode: true }
    });

    const requestedMode = req.body.mode || sessionData?.mode || 'web';
    // Mapping legacy modes if necessary, or strictly following new 'fast' | 'web'
    const mode = (requestedMode === 'fast') ? 'fast' : 'web';

    // ---------------------------------------------------------
    // 🧠 SMART ROUTER & BILLING GATE
    // ---------------------------------------------------------
    let actionType: keyof typeof COSTS;
    let modelName: string;

    const userPlan = user.usage?.plan || PlanType.FREE;

    if (mode === 'fast') {
      actionType = 'CHAT_FAST';
      modelName = 'gpt-4o-mini';
    } else {
      // Mode WEB
      if (userPlan === PlanType.PREMIUM) {
        actionType = 'CHAT_WEB_DEEP';
        modelName = 'sonar-pro';
      } else {
        actionType = 'CHAT_WEB_STANDARD';
        modelName = 'sonar';
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
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    // 6) Variables pour stocker la réponse
    let rawAnswer = "";
    let sources: any[] = [];

    // DEBUG: Trace mode execution
    logger.info(`Starting Chat Generation`, { module: 'Chat', mode, userId, sessionId });
    let finalGlobalScore = 0;
    let outputAnalysis: any = null;
    let sourcesMean = 0;
    let outputScore = 0;
    let diversityPenalty = 0;

    // =========================================================================
    // CAS 1: MODE FAST (RAG + OpenAI GPT-4o-mini)
    // =========================================================================
    if (mode === 'fast') {
      // ... (Existing RAG Logic - keeping it awaiting for now but could be streamed later)
      // For consistency with the request "Check -> Service -> Settlement", we keep the current blocking logic here
      // BUT we need to support the "Settlement" phase at the end.
      // The user request focused on Perplexity streaming.
      // To avoid complexity, we keep RAG as is (it's fast/cheap) but apply charge at the end.

      // ... (Rest of RAG Logic is below, I will just wrap the charge call)
      logger.info('Mode FAST active', { module: 'Chat', strategy: 'RAG+OpenAI', userId, sessionId });

      // 1. Récupérer le contexte RAG
      const contextChunks = await searchSimilarChunks(content, 5);
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

CONSIGNES DE RÉPONSE :
1. Réponds UNIQUEMENT sur la base des SOURCES fournies ci-dessus.
2. Si la réponse n'est pas dans le contexte, dis-le poliment et propose une recherche web (mode 'Web').
3. CITATIONS OBLIGATOIRES : À chaque fois que tu utilises une information, tu DOIS citer la source à la fin de la phrase en utilisant le format Markdown suivant :
   **[Titre de l'article](/article/slug-de-l-article)**
4. Ne cite jamais de sources externes, cite uniquement les articles Epion fournis en contexte.
5. Sois concis et structuré.`;

      // 3. Construire les messages pour OpenAI
      const openaiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
        ...history.filter(m => m.role !== 'system').map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
        }))
      ];

      // 4. Appel OpenAI (NOT Perplexity!)
      try {
        const openaiResponse = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: openaiMessages,
          temperature: 0.5, // Reduced for faithfulness
          max_tokens: 2048,
        });

        rawAnswer = openaiResponse.choices[0].message.content || '';

        // CRITICAL FIX: Stream the blocked response to the client
        // The frontend now expects a stream because we set Transfer-Encoding: chunked
        if (rawAnswer) {
          res.write(rawAnswer);
        } else {
          logger.warn("OpenAI returned empty content");
        }

      } catch (err: any) {
        logger.error("RAG OpenAI Error", { error: err.message });
        // Ensure we don't crash, let the validation at the end handle the empty answer
      }

      // Mode RAG: output quality check
      outputAnalysis = analyzeOutputQuality(rawAnswer);
      outputScore = outputAnalysis.score;
      finalGlobalScore = contextChunks.length > 0 ? outputScore : Math.min(outputScore, 70);

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
      // CAS 2: MODE WEB (Perplexity Stream) - Phase B: Service
      // =========================================================================
      logger.info('Mode WEB active (Stream)', { module: 'Chat', strategy: 'PerplexityStream', userId, sessionId, modelName });

      const chatOptions: ChatOptions = {
        filterSources: req.body.sourceRestricted || false,
        forceNeutrality: req.body.neutralityForced || false,
        recentEvents: req.body.timeRecent || false
      };

      const systemInstruction = generateSystemPrompt('balanced', chatOptions);
      history.unshift({ role: 'system', content: systemInstruction });

      try {
        const stream = streamPerplexity(history, modelName);

        for await (const chunk of stream) {
          rawAnswer += chunk;
          try {
            res.write(chunk);
          } catch (e) {
            // Silent catch: Client disconnected, but we continue generation to validate service delivery
            logger.debug('Client disconnected during stream', { userId });
          }
        }
      } catch (err: any) {
        logger.error('Stream failed', { error: err.message });
        // If stream failed completely, we don't charge.
        // We might have sent partial response though.
        // Ensure we don't crash the server.
      }

      // End of Stream
      // citations logic needs to be handled differently or fetched separately? 
      // Perplexity stream often sends citations at the end or embedded. 
      // Current `streamPerplexity` yields text chunks. 
      // `callPerplexity` returned citations separately.
      // If we assume citations are part of the text or we fetch them differently...
      // For now, let's assume we parse citations from the text or ignore them for the streaming MVP.
      // Or we call `callPerplexity` non-stream to get citations? No, that defeats the purpose.
      // `streamPerplexity` implementation I wrote just parses content.
      // We will skip strict citation parsing for this step or parse basic [1] formatting if needed.
      sources = []; // Placeholder for stream mode
    }

    // =========================================================================
    // SAUVEGARDE & SETTLEMENT (Phase C)
    // =========================================================================

    // Only proceed if we have a valid answer
    if (!rawAnswer || rawAnswer.length < 20) {
      logger.warn("AI Response too short or failed, no charge applied.", { userId, length: rawAnswer?.length });
      // Don't charge.
      res.end(); // Ensure response is closed
      return;
    }

    // Save to DB
    const aiMsg = await prisma.chatMessage.create({
      data: {
        sessionId,
        role: 'assistant',
        content: rawAnswer,
        sources: sources, // Might be empty in stream mode for now
        metadata: {
          factScore: finalGlobalScore,
          mode: mode,
          calculation: {
            sourcesMean,
            outputScore,
            diversityPenalty,
            formula: 'stream-mode'
          },
          outputAnalysis: outputAnalysis
        }
      } as any,
      select: { id: true, content: true, sources: true, metadata: true, createdAt: true } as any,
    }) as any;

    // 💰 CHARGE USER (Phase C: Settlement)
    try {
      await chargeUser(userId, actionType);
      logger.info('User charged successfully', { userId, action: actionType, cost: COSTS[actionType] });
    } catch (error: any) {
      logger.error('CRITICAL: Charge failed after AI delivery', {
        userId,
        error: error.message
      });
    }

    // Clôture
    // res.end() only if not already ended?
    try {
      res.end();
    } catch (e) { }

    // Important: The existing code returned a JSON. Now we streamed text.
    // The Frontend behaves differently.
    // Since we returned checks early, the function is done.
    return;

    // ... (The rest of the function is dead code or needs to be removed/adapted because we return early)
    // I will comment out or remove the old JSON response part.
  } catch (e) {
    next(e);
  }
});

// FIN BLOC
