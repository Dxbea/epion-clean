import type { CorsOptions } from 'cors';
import helmet from 'helmet';
import type { RequestHandler } from 'express';

import { env } from '../env.js';
import {
  DEV_BROWSER_ORIGINS,
  normalizeOrigin,
  normalizeOriginList,
  splitCommaSeparated,
  uniqueOrigins,
  isStrictAppEnvironment,
} from './origin-config.js';

type BrowserOriginEnv = {
  APP_ENV: typeof env.APP_ENV;
  FRONTEND_ORIGIN: string;
  CORS_ALLOWED_ORIGINS?: string;
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
};

type SecurityHeaderEnv = BrowserOriginEnv & {
  BETTER_AUTH_URL?: string;
  CSP_REPORT_ONLY: boolean;
  CSP_REPORT_URI?: string;
  CSP_EXTRA_CONNECT_SRC?: string;
  SENTRY_DSN?: string;
};

function makeCorsError(origin: string | undefined, nodeEnv: string): Error {
  const message =
    nodeEnv === 'production'
      ? 'CORS_FORBIDDEN'
      : `CORS origin not allowed${origin ? `: ${origin}` : ''}`;
  const error = new Error(message) as Error & { status?: number; code?: string };
  error.status = 403;
  error.code = 'CORS_FORBIDDEN';
  return error;
}

export function resolveAllowedBrowserOrigins(config: BrowserOriginEnv): string[] {
  const configuredOrigins = uniqueOrigins([
    normalizeOrigin(config.FRONTEND_ORIGIN, 'FRONTEND_ORIGIN'),
    ...normalizeOriginList(config.CORS_ALLOWED_ORIGINS, 'CORS_ALLOWED_ORIGINS'),
    ...normalizeOriginList(config.BETTER_AUTH_TRUSTED_ORIGINS, 'BETTER_AUTH_TRUSTED_ORIGINS'),
  ]);

  if (isStrictAppEnvironment(config.APP_ENV)) {
    return configuredOrigins;
  }

  return uniqueOrigins([
    ...configuredOrigins,
    ...DEV_BROWSER_ORIGINS,
  ]);
}

export function getAllowedBrowserOrigins(): string[] {
  return resolveAllowedBrowserOrigins(env);
}

export function createCorsOptions(
  allowedOrigins = getAllowedBrowserOrigins(),
  nodeEnv = env.NODE_ENV,
): CorsOptions {
  const allowed = new Set(allowedOrigins);

  return {
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      let normalizedOrigin: string;
      try {
        normalizedOrigin = normalizeOrigin(origin, 'Origin');
      } catch {
        return callback(makeCorsError(origin, nodeEnv));
      }

      if (allowed.has(normalizedOrigin)) {
        return callback(null, normalizedOrigin);
      }

      return callback(makeCorsError(origin, nodeEnv));
    },
    credentials: true,
    optionsSuccessStatus: 204,
  };
}

function sentryOriginsFromDsn(dsn?: string): string[] {
  if (!dsn) return [];
  try {
    return [new URL(dsn).origin];
  } catch {
    return [];
  }
}

export function buildContentSecurityPolicyDirectives(config: SecurityHeaderEnv) {
  const allowedOrigins = resolveAllowedBrowserOrigins(config);
  const apiOrigin = config.BETTER_AUTH_URL
    ? [normalizeOrigin(config.BETTER_AUTH_URL, 'BETTER_AUTH_URL')]
    : [];
  const extraConnectSrc = splitCommaSeparated(config.CSP_EXTRA_CONNECT_SRC);

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    'script-src': [
      "'self'",
      'https://www.googletagmanager.com',
      'https://www.google-analytics.com',
      'https://vercel.live',
    ],
    'style-src': [
      "'self'",
      "'unsafe-inline'",
      'https://fonts.googleapis.com',
      'https://use.typekit.net',
      'https://p.typekit.net',
    ],
    'font-src': [
      "'self'",
      'https://fonts.gstatic.com',
      'https://use.typekit.net',
      'https://p.typekit.net',
    ],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'connect-src': uniqueOrigins([
      "'self'",
      ...allowedOrigins,
      ...apiOrigin,
      ...sentryOriginsFromDsn(config.SENTRY_DSN),
      'https://*.ingest.sentry.io',
      'https://*.ingest.us.sentry.io',
      'https://*.sentry.io',
      'https://www.google-analytics.com',
      'https://analytics.google.com',
      'https://region1.google-analytics.com',
      'https://vitals.vercel-insights.com',
      ...extraConnectSrc,
    ]),
    'media-src': ["'self'", 'https:'],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
  };

  if (isStrictAppEnvironment(config.APP_ENV)) {
    directives['upgrade-insecure-requests'] = [];
  }

  if (config.CSP_REPORT_URI) {
    directives['report-uri'] = [config.CSP_REPORT_URI];
  }

  return directives;
}

export function createSecurityHeadersMiddleware(): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      reportOnly: env.CSP_REPORT_ONLY,
      directives: buildContentSecurityPolicyDirectives(env),
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    strictTransportSecurity: isStrictAppEnvironment(env.APP_ENV)
      ? { maxAge: 31536000, includeSubDomains: true, preload: false }
      : false,
  });
}

export function permissionsPolicyMiddleware(): RequestHandler {
  const value = [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
    'usb=()',
  ].join(', ');

  return (_req, res, next) => {
    res.setHeader('Permissions-Policy', value);
    next();
  };
}


