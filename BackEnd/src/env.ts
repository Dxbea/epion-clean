import 'dotenv/config';
import { z } from 'zod';

type NodeEnv = 'development' | 'test' | 'production';
type AppEnv = 'development' | 'test' | 'staging' | 'production';
type LogLevel = 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'silly';

export type Env = {
  NODE_ENV: NodeEnv;
  APP_ENV: AppEnv;
  DEPLOY_ENV?: AppEnv;
  PORT: number;
  DATABASE_URL: string;
  REDIS_URL: string;
  FRONTEND_ORIGIN: string;
  FRONTEND_URL: string;
  CSRF_SECRET: string;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
  OPENAI_API_KEY?: string;
  SERPER_API_KEY?: string;
  TAVILY_API_KEY?: string;
  GOOGLE_FACT_CHECK_KEY?: string;
  BREVO_API_KEY?: string;
  MAIL_FROM?: string;
  MISTRAL_API_KEY?: string;
  PERPLEXITY_API_KEY?: string;
  SENTRY_DSN?: string;
  LOG_LEVEL: LogLevel;
  BETA_MODE: boolean;
  ENABLE_DEBUG_ROUTES: boolean;
  SEED_ADMIN_EMAIL?: string;
};

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalString = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1).optional(),
);

const optionalUrl = z.preprocess(
  emptyToUndefined,
  z.string().trim().url().optional(),
);

const optionalSecret = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(32).optional(),
);

const optionalBoolean = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
  return value;
}, z.boolean().optional());

const optionalLogLevel = z.preprocess(
  emptyToUndefined,
  z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).optional(),
);

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['development', 'test', 'staging', 'production']).optional(),
  DEPLOY_ENV: z.enum(['development', 'test', 'staging', 'production']).optional(),
  PORT: z.coerce.number().int().positive().default(5175),
  DATABASE_URL: z.string().url().min(1),
  REDIS_URL: optionalUrl,
  FRONTEND_ORIGIN: optionalUrl,
  FRONTEND_URL: optionalUrl,
  CSRF_SECRET: optionalSecret,
  BETTER_AUTH_URL: optionalUrl,
  BETTER_AUTH_SECRET: optionalSecret,
  BETTER_AUTH_TRUSTED_ORIGINS: optionalString,
  OPENAI_API_KEY: optionalString,
  SERPER_API_KEY: optionalString,
  TAVILY_API_KEY: optionalString,
  GOOGLE_FACT_CHECK_KEY: optionalString,
  BREVO_API_KEY: optionalString,
  MAIL_FROM: optionalString,
  MISTRAL_API_KEY: optionalString,
  PERPLEXITY_API_KEY: optionalString,
  SENTRY_DSN: optionalUrl,
  LOG_LEVEL: optionalLogLevel,
  BETA_MODE: optionalBoolean,
  ENABLE_DEBUG_ROUTES: optionalBoolean,
  SEED_ADMIN_EMAIL: optionalString,
}).transform((raw, ctx): Env => {
  const appEnv = raw.APP_ENV ?? raw.DEPLOY_ENV ?? raw.NODE_ENV;
  const isProductionLike = raw.NODE_ENV === 'production';
  const frontendOrigin = raw.FRONTEND_ORIGIN ?? raw.FRONTEND_URL ?? (isProductionLike ? undefined : 'http://localhost:5173');
  const frontendUrl = raw.FRONTEND_URL ?? frontendOrigin;
  const redisUrl = raw.REDIS_URL ?? (isProductionLike ? undefined : 'redis://localhost:6379');
  const betterAuthUrl = raw.BETTER_AUTH_URL ?? (isProductionLike ? undefined : `http://localhost:${raw.PORT}`);
  const betterAuthSecret = raw.BETTER_AUTH_SECRET ?? (isProductionLike ? undefined : 'dev-better-auth-secret-change-me-32-chars-min');
  const csrfSecret = raw.CSRF_SECRET ?? (isProductionLike ? undefined : 'dev-csrf-secret-change-me-32-chars-min');
  const logLevel = raw.LOG_LEVEL ?? (isProductionLike ? 'info' : 'debug');

  if ((appEnv === 'staging' || appEnv === 'production') && raw.NODE_ENV !== 'production') {
    ctx.addIssue({
      code: 'custom',
      path: ['NODE_ENV'],
      message: `NODE_ENV must be production when APP_ENV/DEPLOY_ENV is ${appEnv}.`,
    });
  }

  const requireInProductionLike = (name: keyof Env, value: unknown) => {
    if (isProductionLike && !value) {
      ctx.addIssue({
        code: 'custom',
        path: [name],
        message: `${name} is required when APP_ENV=${appEnv} and NODE_ENV=${raw.NODE_ENV}.`,
      });
    }
  };

  const rejectProductionPlaceholder = (name: keyof Env, value: string | undefined) => {
    if (!isProductionLike || !value) return;
    if (/^(replace_me|change_me|your_|example)/i.test(value)) {
      ctx.addIssue({
        code: 'custom',
        path: [name],
        message: `${name} must be a real value when APP_ENV=${appEnv} and NODE_ENV=${raw.NODE_ENV}.`,
      });
    }
  };

  requireInProductionLike('REDIS_URL', redisUrl);
  requireInProductionLike('FRONTEND_ORIGIN', frontendOrigin);
  requireInProductionLike('BETTER_AUTH_URL', betterAuthUrl);
  requireInProductionLike('BETTER_AUTH_SECRET', betterAuthSecret);
  requireInProductionLike('BETTER_AUTH_TRUSTED_ORIGINS', raw.BETTER_AUTH_TRUSTED_ORIGINS);
  requireInProductionLike('CSRF_SECRET', csrfSecret);
  requireInProductionLike('OPENAI_API_KEY', raw.OPENAI_API_KEY);
  requireInProductionLike('SERPER_API_KEY', raw.SERPER_API_KEY);
  requireInProductionLike('BREVO_API_KEY', raw.BREVO_API_KEY);
  requireInProductionLike('MAIL_FROM', raw.MAIL_FROM);

  rejectProductionPlaceholder('BETTER_AUTH_SECRET', betterAuthSecret);
  rejectProductionPlaceholder('CSRF_SECRET', csrfSecret);
  rejectProductionPlaceholder('BREVO_API_KEY', raw.BREVO_API_KEY);

  return {
    NODE_ENV: raw.NODE_ENV,
    APP_ENV: appEnv,
    DEPLOY_ENV: raw.DEPLOY_ENV,
    PORT: raw.PORT,
    DATABASE_URL: raw.DATABASE_URL,
    REDIS_URL: redisUrl as string,
    FRONTEND_ORIGIN: frontendOrigin as string,
    FRONTEND_URL: frontendUrl as string,
    CSRF_SECRET: csrfSecret as string,
    BETTER_AUTH_URL: betterAuthUrl as string,
    BETTER_AUTH_SECRET: betterAuthSecret as string,
    BETTER_AUTH_TRUSTED_ORIGINS: raw.BETTER_AUTH_TRUSTED_ORIGINS,
    OPENAI_API_KEY: raw.OPENAI_API_KEY,
    SERPER_API_KEY: raw.SERPER_API_KEY,
    TAVILY_API_KEY: raw.TAVILY_API_KEY,
    GOOGLE_FACT_CHECK_KEY: raw.GOOGLE_FACT_CHECK_KEY,
    BREVO_API_KEY: raw.BREVO_API_KEY,
    MAIL_FROM: raw.MAIL_FROM,
    MISTRAL_API_KEY: raw.MISTRAL_API_KEY,
    PERPLEXITY_API_KEY: raw.PERPLEXITY_API_KEY,
    SENTRY_DSN: raw.SENTRY_DSN,
    LOG_LEVEL: logLevel,
    BETA_MODE: raw.BETA_MODE ?? false,
    ENABLE_DEBUG_ROUTES: raw.ENABLE_DEBUG_ROUTES ?? false,
    SEED_ADMIN_EMAIL: raw.SEED_ADMIN_EMAIL,
  };
});

export function parseEnv(input: NodeJS.ProcessEnv): Env {
  return rawEnvSchema.parse(input);
}

let parsedEnv: Env;

try {
  parsedEnv = parseEnv(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('Invalid environment variables:', JSON.stringify(error.format(), null, 2));
    process.exit(1);
  }
  throw error;
}

export const env = parsedEnv;
