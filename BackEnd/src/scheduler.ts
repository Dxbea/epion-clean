import './env.js';
import logger from './lib/logger.js';
import { prisma, closePrisma } from './lib/db.js';
import { redis, closeRedis } from './lib/redis.js';
import { closeOpenedQueues, getBullConnection } from './lib/queue.js';
import { closeSentry, createShutdownManager } from './lib/shutdown.js';
import { initializeCron } from './cron/dailyReset.js';
import { acquireSchedulerLock, scheduleRecurringNewsJobs, startBridgingScoreScheduler } from './lib/scheduler.js';

const log = logger.child({ module: 'SchedulerProcess' });

async function validateSchedulerDependencies(): Promise<void> {
  const redisPong = await redis.ping();
  log.info('Redis startup check passed', { redisPong });

  await prisma.$queryRaw`SELECT 1`;
  log.info('Prisma startup check passed');

  const bullConnection = getBullConnection();
  const bullPong = typeof (bullConnection as any).ping === 'function'
    ? await (bullConnection as any).ping()
    : 'connected';
  log.info('BullMQ startup check passed', { bullPong });
}

async function start(): Promise<void> {
  await validateSchedulerDependencies();
  const shutdown = createShutdownManager({ name: 'scheduler', logger: log });
  const schedulerLock = await acquireSchedulerLock(redis, {
    onLost: () => {
      void shutdown.shutdown('scheduler-lock-lost').catch((error: any) => {
        log.error('Scheduler shutdown after lock loss failed', { error: error?.message });
        process.exit(1);
      });
    },
  });
  await scheduleRecurringNewsJobs();
  const dailyResetTask = initializeCron();
  const bridgingScheduler = startBridgingScoreScheduler();

  shutdown.add({
    name: 'timers-and-cron',
    close: async () => {
      bridgingScheduler.close();
      dailyResetTask.stop();
      if (typeof (dailyResetTask as any).destroy === 'function') {
        (dailyResetTask as any).destroy();
      }
      await schedulerLock.close();
    },
  });
  shutdown.add({ name: 'bullmq-queues', close: closeOpenedQueues });
  shutdown.add({ name: 'redis', close: closeRedis });
  shutdown.add({ name: 'prisma', close: closePrisma });
  shutdown.add({ name: 'sentry', close: () => closeSentry() });
  shutdown.installSignalHandlers();

  log.info('Scheduler process started');
}

start().catch((error: any) => {
  log.error('Scheduler startup failed', { error: error?.message, stack: error?.stack });
  process.exit(1);
});