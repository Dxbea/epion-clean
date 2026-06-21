import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5175),
  DATABASE_URL: z.string().url().min(1),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:5173'),
  CSRF_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_TRUSTED_ORIGINS: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  PERPLEXITY_API_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),
  SERPER_API_KEY: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  FILE_STORAGE_DRIVER: z.enum(['local', 's3-compatible']).default('local'),
  UPLOAD_MAX_SIZE_MB: z.coerce.number().positive().max(25).default(5),
  ALLOW_LOCAL_FILE_STORAGE_IN_PRODUCTION: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().min(1).optional(),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_PUBLIC_BASE_URL: z.string().url().optional(),
}).superRefine((value, ctx) => {
  if (
    value.NODE_ENV === 'production' &&
    value.FILE_STORAGE_DRIVER === 'local' &&
    !value.ALLOW_LOCAL_FILE_STORAGE_IN_PRODUCTION
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['FILE_STORAGE_DRIVER'],
      message: 'FILE_STORAGE_DRIVER=local is refused in production unless ALLOW_LOCAL_FILE_STORAGE_IN_PRODUCTION=true.',
    });
  }

  if (value.FILE_STORAGE_DRIVER === 's3-compatible') {
    for (const key of [
      'S3_ENDPOINT',
      'S3_REGION',
      'S3_BUCKET',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
      'S3_PUBLIC_BASE_URL',
    ] as const) {
      if (!value[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required when FILE_STORAGE_DRIVER=s3-compatible.`,
        });
      }
    }
  }
});

type Env = z.infer<typeof envSchema>;

let parsedEnv: Env;

try {
  parsedEnv = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('Invalid environment variables:', JSON.stringify(error.format(), null, 2));
    process.exit(1);
  }
  throw error;
}

export const env = parsedEnv;
