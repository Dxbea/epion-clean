import { randomUUID } from 'node:crypto';

const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

const EXTEND_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
end
return 0
`;

export interface DiscoveryRedis {
  set(
    key: string,
    value: string,
    expiryMode: 'PX',
    ttlMs: number,
    condition: 'NX',
  ): Promise<string | null>;
  get(key: string): Promise<string | null>;
  eval(
    script: string,
    numberOfKeys: number,
    ...args: Array<string | number>
  ): Promise<unknown>;
}

export interface RedisLockHandle {
  key: string;
  token: string;
  extend(ttlMs: number): Promise<boolean>;
  release(): Promise<void>;
}

export async function acquireRedisLock(
  redis: DiscoveryRedis,
  key: string,
  ttlMs: number,
): Promise<RedisLockHandle | null> {
  const token = randomUUID();
  const acquired = await redis.set(key, token, 'PX', ttlMs, 'NX');
  if (acquired !== 'OK') return null;

  return {
    key,
    token,
    async extend(nextTtlMs) {
      const result = await redis.eval(EXTEND_LOCK_SCRIPT, 1, key, token, nextTtlMs);
      return result === 1;
    },
    async release() {
      await redis.eval(RELEASE_LOCK_SCRIPT, 1, key, token);
    },
  };
}

export async function isRedisKillSwitchActive(
  redis: Pick<DiscoveryRedis, 'get'>,
  key: string,
): Promise<boolean> {
  const value = await redis.get(key);
  const normalized = value?.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'on';
}
