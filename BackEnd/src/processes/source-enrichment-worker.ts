import '../env.js';
import logger from '../lib/logger.js';
import { closePrisma } from '../lib/db.js';
import { closeSentry, createShutdownManager } from '../lib/shutdown.js';
import { createSourceEnrichmentWorker } from '../workers/source-enrichment.worker.js';

const log = logger.child({ module: 'SourceEnrichmentWorkerProcess' });

async function start(): Promise<void> {
  const runtime = createSourceEnrichmentWorker();
  const shutdown = createShutdownManager({ name: 'source-enrichment-worker', logger: log });

  shutdown.add({ name: 'source-enrichment-worker', close: runtime.close });
  shutdown.add({ name: 'prisma', close: closePrisma });
  shutdown.add({ name: 'sentry', close: () => closeSentry() });
  shutdown.installSignalHandlers();
}

start().catch((error: any) => {
  log.error('Source enrichment worker startup failed', { error: error?.message, stack: error?.stack });
  process.exit(1);
});