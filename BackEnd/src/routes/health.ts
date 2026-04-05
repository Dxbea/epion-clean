import { Router } from 'express';
import { prisma } from '../lib/db';
import OpenAI from 'openai';
import axios from 'axios';
import os from 'os';
import { logger } from '../lib/logger';

export const router = Router();

// 🏓 Ping léger pour UptimeRobot (pas de DB, pas d'API)
// Monté sur /api/health → GET /api/health
router.get('/', (_req, res) => {
  res.json({ status: 'ok' });
});

router.get('/diagnostics', async (req, res) => {
  const start = Date.now();

  // Timeout wrapper
  const withTimeout = async <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<T>((resolve) => {
      timer = setTimeout(() => {
        resolve(fallback);
      }, ms);
    });
    return Promise.race([
      promise.finally(() => clearTimeout(timer)),
      timeoutPromise
    ]);
  };

  // 1. Database Core Check
  const checkDatabase = async () => {
    const s = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'up', latency: `${Date.now() - s}ms` };
    } catch (error: any) {
      return { status: 'down', error: error.message };
    }
  };

  // 2. Vector Store Check
  const checkVectors = async () => {
    const s = Date.now();
    try {
      // Validates connection to the table and implicitly the extension if used in index
      const count = await prisma.knowledgeChunk.count();
      // Verify extension existence strictly
      const ext = await prisma.$queryRaw`SELECT * FROM pg_extension WHERE extname = 'vector'`;
      const isVectorEnabled = Array.isArray(ext) && ext.length > 0;

      if (!isVectorEnabled) throw new Error('Vector extension not found in pg_extension');

      return { status: 'up', count, latency: `${Date.now() - s}ms` };
    } catch (error: any) {
      return { status: 'down', error: error.message };
    }
  };

  // 3. OpenAI Check
  const checkOpenAI = async () => {
    const s = Date.now();
    try {
      if (!process.env.OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: 'test',
        dimensions: 2 // Minimal impact
      });
      return { status: 'up', latency: `${Date.now() - s}ms` };
    } catch (error: any) {
      return { status: 'down', error: error.message };
    }
  };

  // 4. Perplexity Check
  const checkPerplexity = async () => {
    const s = Date.now();
    try {
      if (!process.env.PERPLEXITY_API_KEY) throw new Error('Missing PERPLEXITY_API_KEY');
      await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'sonar',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 5000
        }
      );
      return { status: 'up', latency: `${Date.now() - s}ms` };
    } catch (error: any) {
      const msg = error.response?.data?.error || error.message;
      return { status: 'down', error: msg };
    }
  };

  // Run all checks in parallel with 5s timeout
  const TIMEOUT_MS = 5000;
  const [db, vectors, openai, perplexity] = await Promise.all([
    withTimeout(checkDatabase(), TIMEOUT_MS, { status: 'timeout', latency: '>5000ms' }),
    withTimeout(checkVectors(), TIMEOUT_MS, { status: 'timeout', count: -1, latency: '>5000ms' }),
    withTimeout(checkOpenAI(), TIMEOUT_MS, { status: 'timeout', latency: '>5000ms' }),
    withTimeout(checkPerplexity(), TIMEOUT_MS, { status: 'timeout', latency: '>5000ms' })
  ]);

  // System Stats
  const memoryUsage = process.memoryUsage();
  const system = {
    uptime: process.uptime(),
    memory: {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
    },
    loadAvg: os.loadavg(),
  };

  // Global Status
  const isHealthy =
    db.status === 'up' &&
    vectors.status === 'up' &&
    openai.status === 'up' &&
    perplexity.status === 'up';

  const isDegraded = !isHealthy && db.status === 'up'; // If DB is up, it's just degraded, else DOWN.
  const finalStatus = isHealthy ? 'OK' : (isDegraded ? 'DEGRADED' : 'DOWN');
  const statusCode = finalStatus === 'OK' ? 200 : (finalStatus === 'DEGRADED' ? 200 : 503); // 200 even for degraded to allow viewing the JSON

  if (!isHealthy) {
    logger.warn('[HEALTH] System health check failed or degraded', { status: finalStatus, checks: { database: db.status, vectors: vectors.status, openai: openai.status, perplexity: perplexity.status } });
  }

  res.status(statusCode).json({
    status: finalStatus,
    timestamp: new Date().toISOString(),
    total_latency: `${Date.now() - start}ms`,
    checks: {
      database: db,
      vectors: vectors,
      openai: openai,
      perplexity: perplexity,
    },
    system: system
  });
});
