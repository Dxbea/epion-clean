import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createShutdownManager } from '../src/lib/shutdown';
import { startBridgingScoreScheduler } from '../src/lib/scheduler';

const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe('shutdown manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('closes resources in registration order', async () => {
    const order: string[] = [];
    const shutdown = createShutdownManager({
      name: 'test-process',
      logger: silentLogger,
      forceExit: vi.fn(),
    });

    shutdown.add({ name: 'http-server', close: () => order.push('http-server') });
    shutdown.add({ name: 'timers', close: () => order.push('timers') });
    shutdown.add({ name: 'queues', close: () => order.push('queues') });
    shutdown.add({ name: 'redis', close: () => order.push('redis') });
    shutdown.add({ name: 'prisma', close: () => order.push('prisma') });
    shutdown.add({ name: 'sentry', close: () => order.push('sentry') });

    await shutdown.shutdown('test');

    expect(order).toEqual(['http-server', 'timers', 'queues', 'redis', 'prisma', 'sentry']);
  });

  it('is idempotent when shutdown is requested twice', async () => {
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });
    const close = vi.fn(() => blocker);
    const shutdown = createShutdownManager({
      name: 'test-process',
      logger: silentLogger,
      forceExit: vi.fn(),
    });

    shutdown.add({ name: 'slow-resource', close });

    const first = shutdown.shutdown('SIGTERM');
    const second = shutdown.shutdown('SIGINT');
    release();
    await Promise.all([first, second]);

    expect(close).toHaveBeenCalledTimes(1);
    expect(silentLogger.warn).toHaveBeenCalledWith(
      'Shutdown already in progress; ignoring duplicate signal',
      { reason: 'SIGINT' },
    );
  });
});

describe('bridging score scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops future timer runs when closed', async () => {
    const recalculate = vi.fn().mockResolvedValue(0);
    const scheduler = startBridgingScoreScheduler({ intervalMs: 1000, recalculate });

    await vi.advanceTimersByTimeAsync(1000);
    expect(recalculate).toHaveBeenCalledTimes(1);

    scheduler.close();
    await vi.advanceTimersByTimeAsync(5000);

    expect(recalculate).toHaveBeenCalledTimes(1);
  });
});