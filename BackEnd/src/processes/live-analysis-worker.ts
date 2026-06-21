import '../env.js';
import logger from '../lib/logger.js';
import { closePrisma } from '../lib/db.js';
import { closeOpenedQueues } from '../lib/queue.js';
import { closeSentry, createShutdownManager } from '../lib/shutdown.js';
import { createLiveAnalysisWorker } from '../workers/live-analysis.worker.js';

const log = logger.child({ module: 'LiveAnalysisWorkerProcess' });

async function start(): Promise<void> {
  const runtime = createLiveAnalysisWorker();
  const shutdown = createShutdownManager({ name: 'live-analysis-worker', logger: log });

  shutdown.add({ name: 'live-analysis-worker', close: runtime.close });
  shutdown.add({ name: 'bullmq-queues', close: closeOpenedQueues });
  shutdown.add({ name: 'prisma', close: closePrisma });
  shutdown.add({ name: 'sentry', close: () => closeSentry() });
  shutdown.installSignalHandlers();
}

start().catch((error: any) => {
  log.error('Live analysis worker startup failed', { error: error?.message, stack: error?.stack });
  process.exit(1);
});