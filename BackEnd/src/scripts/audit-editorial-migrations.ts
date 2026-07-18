import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { auditEditorialMigrationFiles } from '../lib/editorial-staging/migration-audit.js';

export function runEditorialMigrationAudit(root = path.resolve('prisma/migrations')) {
  return auditEditorialMigrationFiles(root);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = runEditorialMigrationAudit();
  console.log(JSON.stringify(report, null, 2));
  if (!report.valid) process.exitCode = 1;
}
