export const STAGING_SHADOW_CONFIRMATION = 'EPION_STAGING_SHADOW';
export const STAGING_DISCOVERY_SOURCE_KEY = 'staging-editorial-shadow-rss';

export interface StagingShadowSafetyResult {
  environment: string;
  shadowOnly: true;
  autopublishEnabled: false;
}

export function assertStagingShadowSafety(
  values: NodeJS.ProcessEnv = process.env,
  options: { requireStaging?: boolean } = {},
): StagingShadowSafetyResult {
  const environment = values.NODE_ENV?.trim().toLowerCase() || 'development';
  if (options.requireStaging !== false && environment !== 'staging') {
    throw new Error('Shadow staging commands require NODE_ENV=staging');
  }
  const autopublishFlags = [
    'EDITORIAL_AUTOPUBLISH_ENABLED',
    'EDITORIAL_AUTO_PUBLISH_ENABLED',
    'AUTO_PUBLISH_ENABLED',
  ];
  const enabled = autopublishFlags.filter((name) => values[name]?.trim().toLowerCase() === 'true');
  if (enabled.length > 0) throw new Error(`Autopublication must remain disabled in shadow staging: ${enabled.join(', ')}`);
  return { environment, shadowOnly: true, autopublishEnabled: false };
}

export function requireStagingWriteConfirmation(argv: string[]): void {
  const confirmation = argv.find((argument) => argument.startsWith('--confirm='))?.slice('--confirm='.length);
  if (confirmation !== STAGING_SHADOW_CONFIRMATION) {
    throw new Error(`Write mode requires --confirm=${STAGING_SHADOW_CONFIRMATION}`);
  }
}
