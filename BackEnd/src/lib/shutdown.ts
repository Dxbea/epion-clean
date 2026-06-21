import type { Server } from 'http';
import * as Sentry from '@sentry/node';
import logger from './logger.js';

export type ShutdownTask = {
  name: string;
  close: () => Promise<void> | void;
};

type ShutdownLogger = Pick<typeof logger, 'info' | 'warn' | 'error'>;

type ShutdownManagerOptions = {
  name: string;
  timeoutMs?: number;
  logger?: ShutdownLogger;
  forceExit?: (code: number) => void;
};

export type ShutdownManager = {
  add: (task: ShutdownTask) => void;
  shutdown: (reason?: string) => Promise<void>;
  installSignalHandlers: () => void;
};

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 30_000;

export function createShutdownManager(options: ShutdownManagerOptions): ShutdownManager {
  const log = options.logger ?? logger.child({ module: 'Shutdown', process: options.name });
  const timeoutMs = options.timeoutMs ?? (Number(process.env.SHUTDOWN_TIMEOUT_MS) || DEFAULT_SHUTDOWN_TIMEOUT_MS);
  const forceExit = options.forceExit ?? ((code: number) => process.exit(code));
  const tasks: ShutdownTask[] = [];
  let shutdownPromise: Promise<void> | null = null;
  let signalHandlersInstalled = false;

  const runShutdown = async (reason = 'manual'): Promise<void> => {
    if (shutdownPromise) {
      log.warn('Shutdown already in progress; ignoring duplicate signal', { reason });
      return shutdownPromise;
    }

    shutdownPromise = (async () => {
      log.info('Shutdown started', { reason, timeoutMs });
      const timeout = setTimeout(() => {
        log.error('Shutdown timed out; forcing process exit', { timeoutMs });
        forceExit(1);
      }, timeoutMs);
      timeout.unref();

      try {
        for (const task of tasks) {
          log.info('Closing resource', { resource: task.name });
          await task.close();
          log.info('Resource closed', { resource: task.name });
        }
        log.info('Shutdown completed', { reason });
      } finally {
        clearTimeout(timeout);
      }
    })();

    return shutdownPromise;
  };

  return {
    add(task) {
      if (shutdownPromise) {
        throw new Error(`Cannot add shutdown task after shutdown started: ${task.name}`);
      }
      tasks.push(task);
    },

    shutdown: runShutdown,

    installSignalHandlers() {
      if (signalHandlersInstalled) return;
      signalHandlersInstalled = true;

      process.once('SIGTERM', () => {
        void runShutdown('SIGTERM').catch((error) => {
          log.error('Shutdown failed after SIGTERM', { error: error?.message });
          forceExit(1);
        });
      });

      process.once('SIGINT', () => {
        void runShutdown('SIGINT').catch((error) => {
          log.error('Shutdown failed after SIGINT', { error: error?.message });
          forceExit(1);
        });
      });
    },
  };
}

export async function closeHttpServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export async function closeSentry(timeoutMs = 2_000): Promise<void> {
  await Sentry.close(timeoutMs);
}
