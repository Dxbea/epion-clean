import * as Sentry from '@sentry/node';
import { fileURLToPath } from 'node:url';
import { prisma } from '../lib/db.js';

export async function listEditorialAutomationSources() {
  return prisma.discoverySource.findMany({
    orderBy: [{ enabled: 'desc' }, { key: 'asc' }],
    select: {
      key: true, name: true, endpoint: true, sourceId: true, categoryId: true, enabled: true,
      accessPolicy: true, storagePolicy: true, lastSuccessAt: true, consecutiveFailures: true,
    },
  });
}

async function main() {
  try {
    process.stdout.write(`${JSON.stringify(await listEditorialAutomationSources(), null, 2)}\n`);
  } finally {
    await Promise.all([prisma.$disconnect(), Sentry.close(2_000)]);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => setTimeout(() => process.exit(0), 0)).catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exit(1); });
}
