import { fileURLToPath } from 'node:url';
import { prisma } from '../lib/db.js';
import { runEditorialPublicationSmoke } from '../lib/editorial-automation/publication-smoke.js';

export function parseEditorialPublicationSmokeOptions(
  argv: string[],
  values: NodeJS.ProcessEnv = process.env,
) {
  const articleId = argumentValue(argv, '--article-id');
  if (!articleId) throw new Error('--article-id is required');
  const publicApiBaseUrl = values.EDITORIAL_PUBLIC_API_BASE_URL?.trim();
  if (!publicApiBaseUrl) throw new Error('EDITORIAL_PUBLIC_API_BASE_URL is required');
  return { articleId, publicApiBaseUrl };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const options = parseEditorialPublicationSmokeOptions(process.argv.slice(2));
    runEditorialPublicationSmoke(prisma, options)
      .then((report) => {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        if (!report.go) process.exitCode = 1;
      })
      .catch((error) => {
        process.stderr.write(`${message(error)}\n`);
        process.exitCode = 1;
      })
      .finally(() => prisma.$disconnect());
  } catch (error) {
    process.stderr.write(`${message(error)}\n`);
    process.exitCode = 1;
  }
}

function argumentValue(argv: string[], name: string): string | null {
  const prefix = `${name}=`;
  return argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length).trim() || null;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
