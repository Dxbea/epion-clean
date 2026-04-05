import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5175),
  DATABASE_URL: z.string().url().min(1),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(1),
  COOKIE_NAME: z.string().default('epion_session'),
  BCRYPT_ROUNDS: z.coerce.number().default(12),
  OPENAI_API_KEY: z.string().optional(),
  PERPLEXITY_API_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
});

type Env = z.infer<typeof envSchema>;

let parsedEnv: Env;

try {
  parsedEnv = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Invalid environment variables:', JSON.stringify(error.format(), null, 2));
    process.exit(1);
  }
  throw error;
}

export const env = parsedEnv;
