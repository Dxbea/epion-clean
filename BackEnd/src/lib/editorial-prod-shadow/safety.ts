export const PROD_SHADOW_CONFIRMATION = 'EPION_PROD_SHADOW';
export const PROD_SHADOW_DISCOVERY_SOURCE_KEY = 'prod-shadow-editorial-rss';

const AUTOPUBLISH_FLAGS = [
  'EDITORIAL_AUTOPUBLISH_ENABLED',
  'EDITORIAL_AUTO_PUBLISH_ENABLED',
  'AUTO_PUBLISH_ENABLED',
] as const;

export interface ProdShadowSafetyResult {
  environment: 'production';
  shadowOnly: true;
  autopublishEnabled: false;
  maxDocuments: 1;
  maxTopics: 1;
}

export function assertProdShadowSafety(values: NodeJS.ProcessEnv = process.env): ProdShadowSafetyResult {
  if (values.NODE_ENV?.trim().toLowerCase() !== 'production') {
    throw new Error('Production shadow commands require NODE_ENV=production');
  }
  requireBoolean(values, 'EPION_PROD_SHADOW_ENABLED', true);
  for (const name of AUTOPUBLISH_FLAGS) requireBoolean(values, name, false);
  requireBoolean(values, 'DISCOVERY_SCHEDULER_ENABLED', false);
  requireBoolean(values, 'EDITORIAL_SHADOW_OPS_MUTATIONS_ENABLED', false);
  requireBoolean(values, 'EDITORIAL_SHADOW_OPS_KILL_SWITCH', true);
  requireOne(values, 'PROD_SHADOW_MAX_DOCUMENTS');
  requireOne(values, 'PROD_SHADOW_MAX_TOPICS');
  return { environment: 'production', shadowOnly: true, autopublishEnabled: false, maxDocuments: 1, maxTopics: 1 };
}

export function requireProdShadowWriteConfirmation(argv: string[]): void {
  const confirmation = argv.find((argument) => argument.startsWith('--confirm='))?.slice('--confirm='.length);
  if (confirmation !== PROD_SHADOW_CONFIRMATION) {
    throw new Error(`Write mode requires --confirm=${PROD_SHADOW_CONFIRMATION}`);
  }
}

export function readProdShadowFeedUrl(values: NodeJS.ProcessEnv = process.env): string {
  const feedUrl = values.PROD_SHADOW_EDITORIAL_FEED_URL?.trim();
  if (!feedUrl) throw new Error('PROD_SHADOW_EDITORIAL_FEED_URL is required in apply mode');
  const parsed = new URL(feedUrl);
  if (parsed.protocol !== 'https:') throw new Error('PROD_SHADOW_EDITORIAL_FEED_URL must use HTTPS');
  return parsed.toString();
}

function requireBoolean(values: NodeJS.ProcessEnv, name: string, expected: boolean): void {
  const value = values[name]?.trim().toLowerCase();
  if (value !== String(expected)) throw new Error(`${name} must be ${expected}`);
}

function requireOne(values: NodeJS.ProcessEnv, name: string): void {
  if (values[name]?.trim() !== '1') throw new Error(`${name} must be 1 for production shadow`);
}
