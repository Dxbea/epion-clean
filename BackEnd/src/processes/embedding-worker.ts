import '../env.js';
import logger from '../lib/logger.js';
import { closePrisma } from '../lib/db.js';
import { closeSentry, createShutdownManager } from '../lib/shutdown.js';
import { createEmbeddingWorker } from '../workers/embedding.worker.js';

const log = logger.child({ module: 'EmbeddingWorkerProcess' });

async function start(): Promise<void> {
  const runtime = createEmbeddingWorker();
  const shutdown = createShutdownManager({ name: 'embedding-worker', logger: log });

  shutdown.add({ name: 'embedding-worker', close: runtime.close });
  shutdown.add({ name: 'prisma', close: closePrisma });
  shutdown.add({ name: 'sentry', close: () => closeSentry() });
  shutdown.installSignalHandlers();
}

start().catch((error: any) => {
  log.error('Embedding worker startup failed', { error: error?.message, stack: error?.stack });
  process.exit(1);
});