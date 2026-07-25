export interface EditorialDiscoveryProviderFlags {
  gdeltEnabled: boolean;
  gdeltKillSwitch: boolean;
  gdeltMaxQueriesPerRun: number;
  gdeltMaxResultsPerRun: number;
  googleNewsEnabled: boolean;
  googleNewsKillSwitch: boolean;
  googleNewsMaxQueriesPerRun: number;
  googleNewsMaxResultsPerRun: number;
}

export function resolveEditorialDiscoveryProviderFlags(
  values: NodeJS.ProcessEnv = process.env,
): EditorialDiscoveryProviderFlags {
  return {
    gdeltEnabled: booleanFlag(
      values.EDITORIAL_GDELT_DISCOVERY_ENABLED,
      false,
      'EDITORIAL_GDELT_DISCOVERY_ENABLED',
    ),
    gdeltKillSwitch: booleanFlag(
      values.EDITORIAL_GDELT_DISCOVERY_KILL_SWITCH,
      true,
      'EDITORIAL_GDELT_DISCOVERY_KILL_SWITCH',
    ),
    gdeltMaxQueriesPerRun: integerFlag(
      values.EDITORIAL_GDELT_MAX_QUERIES_PER_RUN,
      2,
      1,
      10,
      'EDITORIAL_GDELT_MAX_QUERIES_PER_RUN',
    ),
    gdeltMaxResultsPerRun: integerFlag(
      values.EDITORIAL_GDELT_MAX_RESULTS_PER_RUN,
      10,
      1,
      50,
      'EDITORIAL_GDELT_MAX_RESULTS_PER_RUN',
    ),
    googleNewsEnabled: booleanFlag(
      values.EDITORIAL_GOOGLE_NEWS_DISCOVERY_ENABLED,
      false,
      'EDITORIAL_GOOGLE_NEWS_DISCOVERY_ENABLED',
    ),
    googleNewsKillSwitch: booleanFlag(
      values.EDITORIAL_GOOGLE_NEWS_DISCOVERY_KILL_SWITCH,
      true,
      'EDITORIAL_GOOGLE_NEWS_DISCOVERY_KILL_SWITCH',
    ),
    googleNewsMaxQueriesPerRun: integerFlag(
      values.EDITORIAL_GOOGLE_NEWS_MAX_QUERIES_PER_RUN,
      2,
      1,
      10,
      'EDITORIAL_GOOGLE_NEWS_MAX_QUERIES_PER_RUN',
    ),
    googleNewsMaxResultsPerRun: integerFlag(
      values.EDITORIAL_GOOGLE_NEWS_MAX_RESULTS_PER_RUN,
      10,
      1,
      50,
      'EDITORIAL_GOOGLE_NEWS_MAX_RESULTS_PER_RUN',
    ),
  };
}

function booleanFlag(raw: string | undefined, fallback: boolean, name: string): boolean {
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${name} must be "true" or "false"`);
}

function integerFlag(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}
