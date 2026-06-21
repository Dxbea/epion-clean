import crypto from 'crypto';
import type { Request as ExpressRequest, Response as ExpressResponse, RequestHandler } from 'express';
import type { BetterAuthPlugin } from 'better-auth';

import { env } from '../env.js';
import { logger } from './logger.js';
import { redis } from './redis.js';

type AuthRateLimitAction =
  | 'login'
  | 'signup'
  | 'reset-password-request'
  | 'reset-password-confirm'
  | 'resend-verification'
  | 'email-verification'
  | 'change-password'
  | 'change-email'
  | 'account-deletion'
  | 'session-read'
  | 'session-mutation'
  | 'logout'
  | 'beta-invite';

type AuthRateLimitScope = 'ip' | 'identifier' | 'combo' | 'session';

type AuthRateLimitRule = {
  scope: AuthRateLimitScope;
  windowSeconds: number;
  max: number;
};

type AuthRateLimitIdentity = {
  email?: string | null;
  userId?: string | null;
  token?: string | null;
  sessionId?: string | null;
  inviteCode?: string | null;
};

type RateLimitDecision =
  | { allowed: true; limit: number; remaining: number; resetSeconds: number }
  | { allowed: false; limit: number; remaining: 0; retryAfter: number; resetSeconds: number };

const AUTH_RATE_LIMIT_PREFIX = 'auth-rate:v1';
const FALLBACK_HASH_SECRET = 'epion-auth-rate-limit-dev-pepper';
const GENERIC_RATE_LIMIT_MESSAGE = 'Too many attempts. Please try again later.';
const GENERIC_UNAVAILABLE_MESSAGE = 'Authentication is temporarily unavailable. Please try again later.';

// Production limits. Tests can temporarily lower these through the test-only helpers below.
export const AUTH_RATE_LIMITS: Record<AuthRateLimitAction, AuthRateLimitRule[]> = {
  login: [
    { scope: 'ip', windowSeconds: 15 * 60, max: 20 },
    { scope: 'identifier', windowSeconds: 15 * 60, max: 5 },
    { scope: 'combo', windowSeconds: 15 * 60, max: 5 },
  ],
  signup: [
    { scope: 'ip', windowSeconds: 60 * 60, max: 10 },
    { scope: 'identifier', windowSeconds: 60 * 60, max: 3 },
    { scope: 'combo', windowSeconds: 60 * 60, max: 3 },
  ],
  'reset-password-request': [
    { scope: 'ip', windowSeconds: 15 * 60, max: 8 },
    { scope: 'identifier', windowSeconds: 60 * 60, max: 3 },
    { scope: 'combo', windowSeconds: 60 * 60, max: 3 },
  ],
  'reset-password-confirm': [
    { scope: 'ip', windowSeconds: 15 * 60, max: 15 },
    { scope: 'identifier', windowSeconds: 15 * 60, max: 5 },
    { scope: 'combo', windowSeconds: 15 * 60, max: 5 },
  ],
  'resend-verification': [
    { scope: 'ip', windowSeconds: 15 * 60, max: 6 },
    { scope: 'identifier', windowSeconds: 60 * 60, max: 3 },
    { scope: 'combo', windowSeconds: 60 * 60, max: 3 },
  ],
  'email-verification': [
    { scope: 'ip', windowSeconds: 15 * 60, max: 30 },
    { scope: 'identifier', windowSeconds: 15 * 60, max: 10 },
    { scope: 'combo', windowSeconds: 15 * 60, max: 10 },
  ],
  'change-password': [
    { scope: 'ip', windowSeconds: 15 * 60, max: 10 },
    { scope: 'session', windowSeconds: 15 * 60, max: 5 },
    { scope: 'combo', windowSeconds: 15 * 60, max: 5 },
  ],
  'change-email': [
    { scope: 'ip', windowSeconds: 15 * 60, max: 10 },
    { scope: 'identifier', windowSeconds: 60 * 60, max: 5 },
    { scope: 'session', windowSeconds: 15 * 60, max: 5 },
    { scope: 'combo', windowSeconds: 15 * 60, max: 5 },
  ],
  'account-deletion': [
    { scope: 'ip', windowSeconds: 60 * 60, max: 5 },
    { scope: 'session', windowSeconds: 60 * 60, max: 3 },
    { scope: 'identifier', windowSeconds: 60 * 60, max: 5 },
  ],
  'session-read': [
    { scope: 'ip', windowSeconds: 60, max: 120 },
    { scope: 'session', windowSeconds: 60, max: 120 },
  ],
  'session-mutation': [
    { scope: 'ip', windowSeconds: 15 * 60, max: 20 },
    { scope: 'session', windowSeconds: 15 * 60, max: 10 },
    { scope: 'combo', windowSeconds: 15 * 60, max: 10 },
  ],
  logout: [
    { scope: 'ip', windowSeconds: 60, max: 60 },
    { scope: 'session', windowSeconds: 60, max: 30 },
  ],
  'beta-invite': [
    { scope: 'ip', windowSeconds: 15 * 60, max: 20 },
    { scope: 'identifier', windowSeconds: 15 * 60, max: 8 },
    { scope: 'combo', windowSeconds: 15 * 60, max: 8 },
  ],
};

const testMaxOverrides = new Map<AuthRateLimitAction, number>();
const memoryCounters = new Map<string, { count: number; expiresAt: number }>();

function getHashSecret() {
  return process.env.BETTER_AUTH_SECRET || process.env.CSRF_SECRET || FALLBACK_HASH_SECRET;
}

function digest(value: string) {
  return crypto.createHmac('sha256', getHashSecret()).update(value).digest('hex').slice(0, 32);
}

function normalizeIdentifier(value: string | null | undefined) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || null;
}

function getClientIpFromHeaders(headers: Headers) {
  const forwardedFor = headers.get('x-forwarded-for');
  const rawIp =
    headers.get('cf-connecting-ip') ||
    (forwardedFor ? forwardedFor.split(',')[0] : null) ||
    headers.get('x-real-ip') ||
    'unknown';
  return rawIp.replace(/^::ffff:/, '').trim() || 'unknown';
}

function getClientIpFromExpress(req: ExpressRequest) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const rawForwarded = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const rawIp =
    req.headers['cf-connecting-ip'] ||
    (typeof rawForwarded === 'string' ? rawForwarded.split(',')[0] : null) ||
    req.headers['x-real-ip'] ||
    req.ip ||
    req.socket.remoteAddress ||
    'unknown';
  return String(rawIp).replace(/^::ffff:/, '').trim() || 'unknown';
}

function getBetterAuthPath(request: Request) {
  const pathname = new URL(request.url).pathname;
  return pathname.startsWith('/api/auth')
    ? pathname.slice('/api/auth'.length) || '/'
    : pathname;
}

function getCookieSessionIdentifier(cookieHeader: string | null | undefined) {
  if (!cookieHeader) return null;
  const authCookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().includes('better-auth'));
  return authCookie || null;
}

function pickIdentityValue(identity: AuthRateLimitIdentity) {
  return (
    normalizeIdentifier(identity.email) ||
    normalizeIdentifier(identity.userId) ||
    normalizeIdentifier(identity.token) ||
    normalizeIdentifier(identity.inviteCode) ||
    normalizeIdentifier(identity.sessionId)
  );
}

function scopedKeyPart(scope: AuthRateLimitScope, ip: string, identity: AuthRateLimitIdentity) {
  const identifier = pickIdentityValue(identity);
  const sessionIdentifier = normalizeIdentifier(identity.sessionId);

  if (scope === 'ip') {
    return `ip:${digest(ip)}`;
  }
  if (scope === 'session') {
    return `session:${digest(sessionIdentifier || identifier || ip)}`;
  }
  if (scope === 'identifier') {
    return `id:${digest(identifier || sessionIdentifier || ip)}`;
  }
  return `combo:${digest(`${ip}:${identifier || sessionIdentifier || 'none'}`)}`;
}

function getEffectiveRules(action: AuthRateLimitAction) {
  const rules = AUTH_RATE_LIMITS[action];
  const testOverride = testMaxOverrides.get(action);
  if (env.NODE_ENV === 'test' && typeof testOverride === 'number') {
    return rules.map((rule) => ({ ...rule, max: testOverride, windowSeconds: 60 }));
  }
  if (env.NODE_ENV === 'test') {
    return rules.map((rule) => ({ ...rule, max: Math.max(rule.max, 10_000) }));
  }
  return rules;
}

function buildRateLimitKey(
  action: AuthRateLimitAction,
  rule: AuthRateLimitRule,
  ip: string,
  identity: AuthRateLimitIdentity,
) {
  return `${AUTH_RATE_LIMIT_PREFIX}:${action}:${rule.scope}:${scopedKeyPart(rule.scope, ip, identity)}:${rule.windowSeconds}`;
}

async function incrementRedis(key: string, windowSeconds: number) {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }
  const ttl = await redis.ttl(key);
  return {
    count,
    resetSeconds: ttl > 0 ? ttl : windowSeconds,
  };
}

function incrementMemory(key: string, windowSeconds: number) {
  const now = Date.now();
  const existing = memoryCounters.get(key);
  if (!existing || existing.expiresAt <= now) {
    memoryCounters.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
    return { count: 1, resetSeconds: windowSeconds };
  }
  existing.count += 1;
  return {
    count: existing.count,
    resetSeconds: Math.max(1, Math.ceil((existing.expiresAt - now) / 1000)),
  };
}

async function consumeRateLimitKey(
  key: string,
  windowSeconds: number,
): Promise<{ count: number; resetSeconds: number }> {
  if (env.NODE_ENV === 'test') {
    return incrementMemory(key, windowSeconds);
  }

  try {
    return await incrementRedis(key, windowSeconds);
  } catch (error) {
    logger.warn('Auth rate limiter Redis unavailable', {
      module: 'AuthRateLimit',
      error: error instanceof Error ? error.message : String(error),
    });

    if (env.NODE_ENV === 'production') {
      const unavailable: any = new Error('Auth rate limiter unavailable.');
      unavailable.status = 503;
      unavailable.code = 'AUTH_RATE_LIMIT_UNAVAILABLE';
      throw unavailable;
    }

    return incrementMemory(key, windowSeconds);
  }
}

async function enforceAuthRateLimit(
  action: AuthRateLimitAction,
  ip: string,
  identity: AuthRateLimitIdentity,
): Promise<RateLimitDecision> {
  let mostRestrictive: RateLimitDecision | null = null;

  for (const rule of getEffectiveRules(action)) {
    const key = buildRateLimitKey(action, rule, ip, identity);
    const { count, resetSeconds } = await consumeRateLimitKey(key, rule.windowSeconds);
    const remaining = Math.max(0, rule.max - count);

    if (count > rule.max) {
      return {
        allowed: false,
        limit: rule.max,
        remaining: 0,
        retryAfter: resetSeconds,
        resetSeconds,
      };
    }

    if (!mostRestrictive || remaining < mostRestrictive.remaining) {
      mostRestrictive = {
        allowed: true,
        limit: rule.max,
        remaining,
        resetSeconds,
      };
    }
  }

  return mostRestrictive || { allowed: true, limit: 0, remaining: 0, resetSeconds: 0 };
}

function setRateLimitHeaders(
  setHeader: (name: string, value: string) => void,
  decision: RateLimitDecision,
) {
  setHeader('RateLimit-Limit', String(decision.limit));
  setHeader('RateLimit-Remaining', String(decision.remaining));
  setHeader('RateLimit-Reset', String(decision.resetSeconds));
  if (!decision.allowed) {
    setHeader('Retry-After', String(decision.retryAfter));
  }
}

function jsonRateLimitResponse(decision: RateLimitDecision) {
  const headers = new Headers({ 'content-type': 'application/json' });
  setRateLimitHeaders((name, value) => headers.set(name, value), decision);
  return new Response(
    JSON.stringify({
      error: 'RATE_LIMITED',
      message: GENERIC_RATE_LIMIT_MESSAGE,
    }),
    { status: 429, headers },
  );
}

function jsonUnavailableResponse() {
  return new Response(
    JSON.stringify({
      error: 'AUTH_TEMPORARILY_UNAVAILABLE',
      message: GENERIC_UNAVAILABLE_MESSAGE,
    }),
    {
      status: 503,
      headers: { 'content-type': 'application/json' },
    },
  );
}

function readStringField(body: Record<string, unknown>, field: string) {
  const value = body[field];
  return typeof value === 'string' ? value : null;
}

async function readRequestBody(request: Request) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method.toUpperCase())) {
    return {};
  }

  const contentType = request.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      const body = await request.clone().json();
      return body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    }
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(await request.clone().text());
      return Object.fromEntries(params.entries());
    }
  } catch {
    return {};
  }

  return {};
}

function resolveBetterAuthAction(
  path: string,
  method: string,
): AuthRateLimitAction | null {
  const upperMethod = method.toUpperCase();

  if (path === '/sign-in/email' && upperMethod === 'POST') return 'login';
  if (path === '/sign-up/email' && upperMethod === 'POST') return 'signup';
  if (path === '/request-password-reset' && upperMethod === 'POST') return 'reset-password-request';
  if (path === '/reset-password' && upperMethod === 'POST') return 'reset-password-confirm';
  if (path.startsWith('/reset-password/') && upperMethod === 'GET') return 'reset-password-confirm';
  if (path === '/send-verification-email' && upperMethod === 'POST') return 'resend-verification';
  if (path === '/verify-email' && upperMethod === 'GET') return 'email-verification';
  if (path === '/change-password' && upperMethod === 'POST') return 'change-password';
  if (path === '/change-email' && upperMethod === 'POST') return 'change-email';
  if (path === '/delete-user' && upperMethod === 'POST') return 'account-deletion';
  if (path === '/delete-user/callback' && upperMethod === 'GET') return 'account-deletion';
  if (path === '/get-session' && upperMethod === 'GET') return 'session-read';
  if (path === '/list-sessions' && upperMethod === 'GET') return 'session-read';
  if (
    ['/revoke-session', '/revoke-sessions', '/revoke-other-sessions'].includes(path) &&
    upperMethod === 'POST'
  ) {
    return 'session-mutation';
  }
  if (path === '/sign-out' && upperMethod === 'POST') return 'logout';

  return null;
}

function identityFromBetterAuthRequest(
  action: AuthRateLimitAction,
  path: string,
  request: Request,
  body: Record<string, unknown>,
): AuthRateLimitIdentity {
  const url = new URL(request.url);
  const cookieSession = getCookieSessionIdentifier(request.headers.get('cookie'));

  if (action === 'login' || action === 'signup' || action === 'reset-password-request' || action === 'resend-verification') {
    return {
      email: readStringField(body, 'email'),
      inviteCode: action === 'signup' ? readStringField(body, 'inviteCode') : null,
    };
  }

  if (action === 'reset-password-confirm') {
    const tokenFromPath = path.startsWith('/reset-password/') ? path.slice('/reset-password/'.length) : null;
    return {
      token: readStringField(body, 'token') || url.searchParams.get('token') || tokenFromPath,
    };
  }

  if (action === 'email-verification') {
    return { token: url.searchParams.get('token') };
  }

  if (action === 'change-email') {
    return {
      email: readStringField(body, 'newEmail'),
      sessionId: cookieSession,
    };
  }

  if (action === 'session-mutation') {
    return {
      token: readStringField(body, 'token'),
      sessionId: cookieSession,
    };
  }

  if (action === 'account-deletion') {
    return {
      token: readStringField(body, 'token') || url.searchParams.get('token'),
      sessionId: cookieSession,
    };
  }

  return { sessionId: cookieSession };
}

export const authRateLimitPlugin: BetterAuthPlugin = {
  id: 'epion-auth-rate-limit',
  async onRequest(request) {
    const path = getBetterAuthPath(request);
    const action = resolveBetterAuthAction(path, request.method);
    if (!action) return;

    try {
      const body = await readRequestBody(request);
      const decision = await enforceAuthRateLimit(
        action,
        getClientIpFromHeaders(request.headers),
        identityFromBetterAuthRequest(action, path, request, body),
      );
      if (!decision.allowed) {
        return { response: jsonRateLimitResponse(decision) };
      }
    } catch (error: any) {
      if (error?.code === 'AUTH_RATE_LIMIT_UNAVAILABLE') {
        return { response: jsonUnavailableResponse() };
      }
      throw error;
    }
  },
};

export const betterAuthRedisRateLimitStorage = {
  async get(key: string) {
    const raw = await redis.get(`${AUTH_RATE_LIMIT_PREFIX}:better-auth-legacy:${digest(key)}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as { key: string; count: number; lastRequest: number };
    } catch {
      return null;
    }
  },
  async set(key: string, value: { key: string; count: number; lastRequest: number }) {
    await redis.set(
      `${AUTH_RATE_LIMIT_PREFIX}:better-auth-legacy:${digest(key)}`,
      JSON.stringify(value),
      'EX',
      60 * 60,
    );
  },
  async consume(key: string, rule: { window: number; max: number }) {
    const storageKey = `${AUTH_RATE_LIMIT_PREFIX}:better-auth:${digest(key)}:${rule.window}`;
    const { count, resetSeconds } = await consumeRateLimitKey(storageKey, rule.window);
    return {
      allowed: count <= rule.max,
      retryAfter: count > rule.max ? resetSeconds : null,
    };
  },
};

export async function enforceExpressAuthRateLimit(
  req: ExpressRequest,
  res: ExpressResponse,
  action: AuthRateLimitAction,
  identity: AuthRateLimitIdentity,
) {
  try {
    const decision = await enforceAuthRateLimit(action, getClientIpFromExpress(req), identity);
    setRateLimitHeaders((name, value) => res.setHeader(name, value), decision);
    if (!decision.allowed) {
      res.status(429).json({
        error: 'RATE_LIMITED',
        message: GENERIC_RATE_LIMIT_MESSAGE,
      });
      return false;
    }
    return true;
  } catch (error: any) {
    if (error?.code === 'AUTH_RATE_LIMIT_UNAVAILABLE') {
      res.status(503).json({
        error: 'AUTH_TEMPORARILY_UNAVAILABLE',
        message: GENERIC_UNAVAILABLE_MESSAGE,
      });
      return false;
    }
    throw error;
  }
}

export function betaInviteRateLimit(): RequestHandler {
  return async (req, res, next) => {
    try {
      const ok = await enforceExpressAuthRateLimit(req, res, 'beta-invite', {
        inviteCode: typeof req.body?.code === 'string' ? req.body.code : null,
      });
      if (!ok) return;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function resetAuthRateLimitForTests() {
  memoryCounters.clear();
  testMaxOverrides.clear();
}

export function setAuthRateLimitMaxForTests(action: AuthRateLimitAction, max: number) {
  testMaxOverrides.set(action, max);
}

export function getAuthRateLimitKeysForTests() {
  return Array.from(memoryCounters.keys());
}
