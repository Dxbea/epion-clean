import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { parseEnv } from '../src/env.js';

const productionEnv = {
  NODE_ENV: 'production',
  APP_ENV: 'production',
  PORT: '5175',
  DATABASE_URL: 'postgresql://postgres:postgres@db.example.com:5432/epion?schema=public',
  REDIS_URL: 'rediss://redis.example.com:6379',
  FRONTEND_ORIGIN: 'https://www.epion.app',
  BETTER_AUTH_URL: 'https://api.epion.app',
  BETTER_AUTH_SECRET: 'real_better_auth_secret_32_chars_minimum',
  BETTER_AUTH_TRUSTED_ORIGINS: 'https://www.epion.app,https://epion.app',
  CSRF_SECRET: 'real_csrf_secret_32_chars_minimum_value',
  OPENAI_API_KEY: 'sk-test-openai',
  SERPER_API_KEY: 'serper-test-key',
  BREVO_API_KEY: 'brevo-test-key',
  MAIL_FROM: 'Epion <no-reply@epion.app>',
} satisfies NodeJS.ProcessEnv;

function withoutKey(key: keyof typeof productionEnv) {
  const copy = { ...productionEnv };
  delete copy[key];
  return copy;
}

function issuePathsFor(input: NodeJS.ProcessEnv): string[] {
  try {
    parseEnv(input);
    return [];
  } catch (error) {
    if (error instanceof ZodError) {
      return error.issues.map((issue) => issue.path.join('.'));
    }
    throw error;
  }
}

describe('environment validation', () => {
  it('rejects production without REDIS_URL', () => {
    expect(issuePathsFor(withoutKey('REDIS_URL'))).toContain('REDIS_URL');
  });

  it('uses NODE_ENV=production with APP_ENV=staging for staging deployments', () => {
    const env = parseEnv({
      ...productionEnv,
      APP_ENV: 'staging',
    });

    expect(env.NODE_ENV).toBe('production');
    expect(env.APP_ENV).toBe('staging');
  });

  it('rejects APP_ENV=staging when NODE_ENV is not production', () => {
    expect(issuePathsFor({
      ...productionEnv,
      NODE_ENV: 'development',
      APP_ENV: 'staging',
    })).toContain('NODE_ENV');
  });

  it('rejects NODE_ENV=staging because Node/Express production behavior depends on NODE_ENV=production', () => {
    expect(issuePathsFor({
      ...productionEnv,
      NODE_ENV: 'staging',
      APP_ENV: 'staging',
    })).toContain('NODE_ENV');
  });

  it('rejects production without Better Auth and CSRF secrets', () => {
    const paths = issuePathsFor({
      ...withoutKey('BETTER_AUTH_SECRET'),
      CSRF_SECRET: undefined,
    });

    expect(paths).toContain('BETTER_AUTH_SECRET');
    expect(paths).toContain('CSRF_SECRET');
  });

  it('rejects invalid production URLs for critical origins', () => {
    const paths = issuePathsFor({
      ...productionEnv,
      REDIS_URL: 'not-a-url',
      BETTER_AUTH_URL: 'not-a-url',
      FRONTEND_ORIGIN: 'not-a-url',
    });

    expect(paths).toContain('REDIS_URL');
    expect(paths).toContain('BETTER_AUTH_URL');
    expect(paths).toContain('FRONTEND_ORIGIN');
  });

  it('keeps development usable with the planned minimum variables', () => {
    const env = parseEnv({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/epion?schema=public',
    });

    expect(env.REDIS_URL).toBe('redis://localhost:6379');
    expect(env.FRONTEND_ORIGIN).toBe('http://localhost:5173');
    expect(env.BETTER_AUTH_URL).toBe('http://localhost:5175');
    expect(env.BETA_MODE).toBe(false);
  });

  it('keeps test usable with the planned minimum variables', () => {
    const env = parseEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/epion_test?schema=public',
    });

    expect(env.REDIS_URL).toBe('redis://localhost:6379');
    expect(env.CSRF_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(env.BETTER_AUTH_SECRET.length).toBeGreaterThanOrEqual(32);
  });

  it('does not require removed legacy JWT or cookie secrets', () => {
    expect(() => parseEnv(productionEnv)).not.toThrow();
  });
});

