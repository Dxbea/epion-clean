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
import { checkAndChargeUser, COSTS } from '../lib/billing-service';
import { PlanType } from '@prisma/client';
import { callPerplexity, type PerplexityMessage, generateSystemPrompt } from '../lib/perplexity';
import { getRichTrustScore } from '../lib/trust-score';
import { analyzeOutputQuality } from '../lib/semantic-scanner'; // AJOUT
import { AI_MODELS } from '../config/ai-models';
import { ChatOptions } from '../types/chat';


// ————————————————————————————————————————————————————————————————
// PROMPTS SYSTEME DYNAMIQUES
// ————————————————————————————————————————————————————————————————
// (Fonction getSystemPrompt déplacée dans ../lib/perplexity.ts)


// ————————————————————————————————————————————————————————————————
// Helpers limites / plan

function getPlanForUser(_userId: string): PlanId {
  // TODO: plus tard, récupérer le vrai plan dans la DB
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
      prisma.chatSession.delete({ where: { id } }),
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

    console.log(`[CHAT_DEBUG] User Content received: "${content}"`);
    console.log(`[CHAT_DEBUG] History length (before system): ${history.length}`);
    if (history.length > 0) {
      console.log(`[CHAT_DEBUG] History last item:`, JSON.stringify(history[history.length - 1], null, 2));
    }

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
        modelName = 'llama-3.1-sonar-large-128k-online';
      } else {
        actionType = 'CHAT_WEB_STANDARD';
        modelName = 'llama-3.1-sonar-small-128k-online';
      }
    }

    // 💰 BILLING CHECK
    try {
      await checkAndChargeUser(userId, actionType);
    } catch (error: any) {
      if (error.message === 'INSUFFICIENT_FUNDS_WEB') {
        return res.status(402).json({
          error: "Quota Web épuisé. Passez en mode Eco.",
          code: "QUOTA_WEB",
          fallbackMode: "fast"
        });
      }
      if (error.message === 'INSUFFICIENT_FUNDS_TOTAL') {
        return res.status(402).json({
          error: "Crédits épuisés pour aujourd'hui.",
          code: "QUOTA_TOTAL"
        });
      }
      throw error; // Other errors
    }

    // 6) Injection du System Prompt Dynamique
    const chatOptions: ChatOptions = {
      filterSources: req.body.sourceRestricted || false,
      forceNeutrality: req.body.neutralityForced || false,
      recentEvents: req.body.timeRecent || false
    };

    // Use effective mode for prompt generation (can map 'web' to 'balanced' or 'precise' if needed)
    // For now, assuming generateSystemPrompt handles 'fast' and others.
    // If generateSystemPrompt expects 'balanced'/'precise', we map 'web' -> 'balanced'
    const promptMode = (mode === 'fast') ? 'fast' : 'balanced';
    const systemInstruction = generateSystemPrompt(promptMode as any, chatOptions);

    // CRUCIAL FIX: Inject System Prompt at the beginning of history
    history.unshift({ role: 'system', content: systemInstruction });

    // 7) Call Perplexity with determined model
    const perplexityResponse = await callPerplexity(history, modelName);

    // DEBUG: Check what API returns
    console.log('[CHAT_DEBUG] Perplexity Response keys:', Object.keys(perplexityResponse));
    console.log('[CHAT_DEBUG] Citations:', (perplexityResponse as any).citations);

    const rawAnswer = perplexityResponse.choices[0].message.content;
    const citations = (perplexityResponse as any).citations || [];

    // Map citations to Source objects with DB Lookup (V5 Engine)
    const sources = await Promise.all(citations.map(async (url: string, idx: number) => {
      let domain = '';
      try { domain = new URL(url).hostname.replace('www.', ''); } catch { }

      console.log(`[TrustScore] Fetching score for: ${domain}`);

      // 1. Calcul du TrustScore V2 (Moteur Centralisé)
      const richScore = await getRichTrustScore(domain);

      return {
        id: idx + 1,
        // Identify
        name: richScore.metadata.name,
        url: url,
        domain: domain,
        logo: `https://logo.clearbit.com/${domain}`,

        // Reliability (V5 - Matrix Risk)
        score: richScore.globalScore,
        type: richScore.metadata.type,

        // New V5 Data for UI
        confidence: richScore.confidenceLevel,
        justification: richScore.metadata.justification,
        description: richScore.metadata.description, // AJOUT CORRECTIF

        // Flags & Metrics
        metrics: richScore.details, // { transparency, editorial... }
        flags: richScore.flags      // { isClickbait, ... }
      };
    }));

    // --- ZERO TRUST VERIFICATION ENGINE ---

    // 1. Source Reliability (Source Mean)
    const validScores = sources.filter(s => s.score > 0).map(s => s.score);
    const sourcesMean = validScores.length > 0
      ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
      : (sources.length > 0 ? 50 : 0);

    // 2. Output Quality Check (The 'Tone Analyzer')
    const outputAnalysis = analyzeOutputQuality(rawAnswer);
    const outputScore = outputAnalysis.score;
    // { score, isClickbait, biasLevel, details: { capsRatio... } }

    // 3. Diversity Penalty
    // Ex: 3 sources from 'bfmtv.com' out of 4 total -> Penalty.
    const domains = sources.map(s => s.domain).filter(d => !!d);
    let diversityPenalty = 0;

    // Calculate diversity only if we have at least 3 sources
    if (domains.length >= 3) {
      const counts: Record<string, number> = {};
      domains.forEach(d => { counts[d] = (counts[d] || 0) + 1; });

      const maxCount = Math.max(...Object.values(counts));
      const dominanceRatio = maxCount / domains.length;

      if (dominanceRatio > 0.5) {
        // Flat 5 point penalty for > 50%, 10 points for > 75%
        diversityPenalty = dominanceRatio > 0.75 ? 10 : 5;
      }
    }

    // 4. Final Global Score Calculation
    // Formula: (Sources * 0.75) + (Output * 0.25) - DiversityPenalty
    let calculatedScore = (sourcesMean * 0.75) + (outputScore * 0.25);
    calculatedScore = calculatedScore - diversityPenalty;

    // Bounds check [0, 100]
    const finalGlobalScore = Math.min(100, Math.max(0, Math.round(calculatedScore)));

    // Create structured content
    // NOUVEAU: On sauvegarde le texte brut dans `content`
    // et les métadonnées dans `sources` et `metadata`.
    const aiMsg = await prisma.chatMessage.create({
      data: {
        sessionId,
        role: 'assistant',
        content: rawAnswer,
        sources: sources,
        metadata: {
          factScore: finalGlobalScore,

          // Debug / Transparency Data
          calculation: {
            sourcesMean,
            outputScore,
            diversityPenalty,
            formula: "(sources * 0.75) + (output * 0.25) - diversity"
          },
          outputAnalysis: outputAnalysis
        }
      } as any,
      select: { id: true, content: true, sources: true, metadata: true, createdAt: true } as any,
    }) as any;

    /*
    // 7) UPDATE QUOTA (Incrémenter dailyQueryCount)
    // REMOVED: Managed by billingService now.
    await prisma.user.update({
      where: { id: userId },
      data: { dailyQueryCount: { increment: 1 } },
    });
    */

    // 8) auto-title si vide
    if (!session.topic || session.topic === 'New chat') {
      await prisma.chatSession.update({
        where: { id: sessionId },
        data: { topic: autoTitleFrom(content), updatedAt: new Date() },
      });
    } else {
      await prisma.chatSession.update({
        where: { id: sessionId },
        data: { updatedAt: new Date() },
      });
    }



    res.status(201).json({
      user: {
        id: userMsg.id,
        role: 'user',
        content,
        createdAt: userMsg.createdAt.toISOString(),
      },
      assistant: {
        id: aiMsg.id,
        role: 'assistant',
        content: aiMsg.content, // raw text
        createdAt: aiMsg.createdAt,
        // FORCE USE OF LOCAL VARIABLES to avoid Prisma return issues
        sources: sources,
        metadata: {
          factScore: finalGlobalScore,

          // Provide full transparency for the Frontend Modal
          calculation: {
            sourcesMean,
            outputScore,
            diversityPenalty
          },
          outputAnalysis: outputAnalysis
        }
      },
    });
  } catch (e) {
    next(e);
  }
});

// FIN BLOC
