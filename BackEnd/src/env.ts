import 'dotenv/config';
import { z } from 'zod';
import {
  assertHttpsPublicOrigin,
  isStrictAppEnvironment,
  normalizeOrigin,
  normalizeOriginList,
  type AppEnvironment,
} from './lib/origin-config.js';

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_ENV: z.enum(['development', 'test', 'staging', 'production']).optional(),
  PORT: z.coerce.number().default(5175),
  DATABASE_URL: z.string().url().min(1),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:5173'),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  CSRF_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_TRUSTED_ORIGINS: z.string().optional(),
  CSP_REPORT_ONLY: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  CSP_REPORT_URI: z.string().url().optional(),
  CSP_EXTRA_CONNECT_SRC: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  PERPLEXITY_API_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),
  SERPER_API_KEY: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
});

type RawEnv = z.infer<typeof rawEnvSchema>;
export type Env = Omit<RawEnv, 'APP_ENV'> & { APP_ENV: AppEnvironment };

function resolveAppEnv(raw: RawEnv): AppEnvironment {
  return raw.APP_ENV ?? raw.NODE_ENV;
}

function validateOriginEnv(env: Env): void {
  const errors: string[] = [];

  try {
    normalizeOrigin(env.FRONTEND_ORIGIN, 'FRONTEND_ORIGIN');
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  for (const [label, value] of [
    ['CORS_ALLOWED_ORIGINS', env.CORS_ALLOWED_ORIGINS],
    ['BETTER_AUTH_TRUSTED_ORIGINS', env.BETTER_AUTH_TRUSTED_ORIGINS],
  ] as const) {
    try {
      normalizeOriginList(value, label);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (!isStrictAppEnvironment(env.APP_ENV)) {
    if (errors.length > 0) {
      throw new Error(errors.join('\n'));
    }
    return;
  }

  const strictOrigins: Array<[string, string]> = [
    ['FRONTEND_ORIGIN', env.FRONTEND_ORIGIN],
    ...normalizeOriginList(env.CORS_ALLOWED_ORIGINS, 'CORS_ALLOWED_ORIGINS').map(
      (origin): [string, string] => ['CORS_ALLOWED_ORIGINS', origin],
    ),
    ...normalizeOriginList(env.BETTER_AUTH_TRUSTED_ORIGINS, 'BETTER_AUTH_TRUSTED_ORIGINS').map(
      (origin): [string, string] => ['BETTER_AUTH_TRUSTED_ORIGINS', origin],
    ),
  ];

  for (const [label, origin] of strictOrigins) {
    try {
      assertHttpsPublicOrigin(normalizeOrigin(origin, label), label);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (env.BETTER_AUTH_URL) {
    try {
      assertHttpsPublicOrigin(normalizeOrigin(env.BETTER_AUTH_URL, 'BETTER_AUTH_URL'), 'BETTER_AUTH_URL');
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  } else {
    errors.push('BETTER_AUTH_URL must be set in staging/production.');
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
}

export function parseEnv(raw: NodeJS.ProcessEnv): Env {
  const parsed = rawEnvSchema.parse(raw);
  const env = {
    ...parsed,
    APP_ENV: resolveAppEnv(parsed),
  };
  validateOriginEnv(env);
  return env;
}

let parsedEnv: Env;

try {
  parsedEnv = parseEnv(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('Invalid environment variables:', JSON.stringify(error.format(), null, 2));
  } else if (error instanceof Error) {
    console.error('Invalid environment variables:', error.message);
  } else {
    console.error('Invalid environment variables:', String(error));
  }
  process.exit(1);
}

export const env = parsedEnv;
