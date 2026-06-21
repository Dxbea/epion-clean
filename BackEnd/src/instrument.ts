// BackEnd/src/instrument.ts
import { env } from './env.js';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

// ===========================
// SENTRY INITIALIZATION
// ===========================
Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: 1.0, // 100% of transactions for sampling (adjust in prod)
    profilesSampleRate: 1.0, // Profiling rate
    integrations: [
        nodeProfilingIntegration(),
    ],
    // Don't send errors if DSN is not configured (local dev)
    enabled: !!env.SENTRY_DSN,
});

console.log(`[Sentry] Instrumentation loaded (Env: ${env.NODE_ENV}, Enabled: ${!!env.SENTRY_DSN})`);
