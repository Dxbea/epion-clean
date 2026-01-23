// BackEnd/src/instrument.ts
import 'dotenv/config'; // Ensure env vars are loaded first
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

// ===========================
// SENTRY INITIALIZATION
// ===========================
Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 1.0, // 100% of transactions for sampling (adjust in prod)
    profilesSampleRate: 1.0, // Profiling rate
    integrations: [
        nodeProfilingIntegration(),
    ],
    // Don't send errors if DSN is not configured (local dev)
    enabled: !!process.env.SENTRY_DSN,
});

console.log(`[Sentry] Instrumentation loaded (Env: ${process.env.NODE_ENV}, Enabled: ${!!process.env.SENTRY_DSN})`);
