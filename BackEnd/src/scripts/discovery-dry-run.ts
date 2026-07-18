import { prisma } from '../lib/db.js';
import logger from '../lib/logger.js';
import {
  runDiscoverySource,
  type DiscoveryOrchestratorClient,
} from '../lib/discovery/discovery-orchestrator.js';
import { createWorkerDiscoveryConnectorRegistry } from '../workers/discovery-bootstrap.js';

const log = logger.child({ module: 'DiscoveryDryRun' });

interface CliOptions {
  sourceId?: string;
  allEnabled: boolean;
  limit: number;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const registry = createWorkerDiscoveryConnectorRegistry();
  const sourceIds = options.sourceId
    ? [options.sourceId]
    : (await prisma.discoverySource.findMany({
        where: { enabled: true, disabledReason: null },
        orderBy: [{ priority: 'desc' }, { key: 'asc' }],
        take: options.limit,
        select: { id: true },
      })).map((source) => source.id);

  if (sourceIds.length === 0) {
    log.warn('No discovery source selected for dry-run');
    return;
  }

  for (const sourceId of sourceIds) {
    const result = await runDiscoverySource(
      {
        client: prisma as unknown as DiscoveryOrchestratorClient,
        registry,
      },
      sourceId,
      { dryRun: true, allowDisabled: Boolean(options.sourceId) },
    );
    log.info('Discovery dry-run result', {
      sourceId,
      connectorType: result.connectorType,
      candidatesDiscovered: result.candidatesDiscovered,
      preparedCorpusEntries: result.corpusResults.length,
      projectedNextRunAt: result.nextRunAt.toISOString(),
      durationMs: result.durationMs,
    });
  }
}

function parseOptions(args: string[]): CliOptions {
  let sourceId: string | undefined;
  let allEnabled = false;
  let limit = 20;

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--source-id') {
      sourceId = requiredValue(args[++index], '--source-id');
    } else if (argument === '--all-enabled') {
      allEnabled = true;
    } else if (argument === '--limit') {
      const raw = requiredValue(args[++index], '--limit');
      limit = Number(raw);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new Error('--limit must be an integer between 1 and 100');
      }
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (Boolean(sourceId) === allEnabled) {
    throw new Error('Use exactly one of --source-id <id> or --all-enabled');
  }
  return { sourceId, allEnabled, limit };
}

function requiredValue(value: string | undefined, option: string): string {
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return value;
}

main()
  .catch((error) => {
    log.error('Discovery dry-run failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
