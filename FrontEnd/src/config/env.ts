import { z } from 'zod';

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalUrl = z.preprocess(
  emptyToUndefined,
  z.string().trim().url().optional(),
);

const optionalString = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1).optional(),
);

const frontendEnvSchema = z.object({
  PROD: z.boolean(),
  VITE_API_URL: optionalUrl,
  VITE_SENTRY_DSN: optionalUrl,
  VITE_GA_ID: optionalString,
}).transform((raw, ctx) => {
  const apiUrl = raw.VITE_API_URL ?? (raw.PROD ? undefined : 'http://localhost:5175');

  if (raw.PROD && !apiUrl) {
    ctx.addIssue({
      code: 'custom',
      path: ['VITE_API_URL'],
      message: 'VITE_API_URL is required for production frontend builds/runtime.',
    });
  }

  return {
    VITE_API_URL: apiUrl as string,
    VITE_SENTRY_DSN: raw.VITE_SENTRY_DSN,
    VITE_GA_ID: raw.VITE_GA_ID,
  };
});

export const frontendEnv = frontendEnvSchema.parse({
  PROD: import.meta.env.PROD,
  VITE_API_URL: import.meta.env.VITE_API_URL,
  VITE_SENTRY_DSN: import.meta.env.VITE_SENTRY_DSN,
  VITE_GA_ID: import.meta.env.VITE_GA_ID,
});
