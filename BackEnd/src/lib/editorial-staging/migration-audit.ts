import fs from 'node:fs';
import path from 'node:path';

export const EDITORIAL_MIGRATION_SEQUENCE = [
  '20260717120000_add_discovery_corpus_foundation',
  '20260718090000_add_document_discovery_observation_state',
  '20260718150000_add_document_corpus_rag',
  '20260718180000_add_editorial_shadow_clustering',
  '20260718210000_add_editorial_source_dossiers',
  '20260718230000_add_controlled_editorial_drafts',
  '20260719010000_add_editorial_review_audit',
  '20260719030000_add_editorial_draft_revisions',
  '20260719050000_add_manual_editorial_publication',
  '20260719100000_add_editorial_verification_runs',
  '20260719120000_add_editorial_verification_async_shadow',
  '20260720100000_add_editorial_shadow_ops_audit',
] as const;

export interface EditorialMigrationAuditReport {
  valid: boolean;
  sequence: string[];
  checks: Array<{ code: string; passed: boolean; detail: string }>;
}

export function auditEditorialMigrationFiles(migrationsRoot: string): EditorialMigrationAuditReport {
  const directories = fs.readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const checks: EditorialMigrationAuditReport['checks'] = [];
  for (const migration of EDITORIAL_MIGRATION_SEQUENCE) {
    const sqlPath = path.join(migrationsRoot, migration, 'migration.sql');
    checks.push({ code: `MIGRATION_PRESENT:${migration}`, passed: fs.existsSync(sqlPath), detail: sqlPath });
  }
  const positions = EDITORIAL_MIGRATION_SEQUENCE.map((migration) => directories.indexOf(migration));
  checks.push({
    code: 'EDITORIAL_MIGRATIONS_ORDERED',
    passed: positions.every((position, index) => position >= 0 && (index === 0 || position > positions[index - 1]!)),
    detail: EDITORIAL_MIGRATION_SEQUENCE.join(' -> '),
  });
  const allBeforeCorpus = directories.filter((name) => name < EDITORIAL_MIGRATION_SEQUENCE[2])
    .map((name) => readSql(migrationsRoot, name)).join('\n');
  checks.push({ code: 'PGVECTOR_CREATED_BEFORE_CORPUS', passed: /CREATE EXTENSION IF NOT EXISTS vector/i.test(allBeforeCorpus), detail: 'pgvector must exist before DocumentChunk and EditorialTopic vectors' });
  checks.push(dependencyCheck(migrationsRoot, 1, 'DocumentDiscovery', 'DISCOVERY_FOUNDATION_BEFORE_OBSERVATION'));
  checks.push(dependencyCheck(migrationsRoot, 3, 'DocumentChunk', 'DOCUMENT_CHUNKS_BEFORE_CLUSTERING'));
  checks.push(dependencyCheck(migrationsRoot, 4, 'EditorialCandidate', 'CANDIDATES_BEFORE_DOSSIERS'));
  checks.push(dependencyCheck(migrationsRoot, 5, 'EditorialBrief', 'BRIEFS_BEFORE_DRAFTS'));
  checks.push(dependencyCheck(migrationsRoot, 6, 'EditorialDraft', 'DRAFTS_BEFORE_REVIEW_AUDIT'));
  checks.push(dependencyCheck(migrationsRoot, 7, 'EditorialReviewAuditLog', 'AUDIT_BEFORE_REVISIONS'));
  checks.push(dependencyCheck(migrationsRoot, 9, 'EditorialDraftRevision', 'REVISIONS_BEFORE_VERIFICATION'));
  checks.push(dependencyCheck(migrationsRoot, 10, 'EditorialVerificationRun', 'VERIFICATION_BEFORE_ASYNC_SHADOW'));
  checks.push(dependencyCheck(migrationsRoot, 11, 'EditorialReviewAuditAction', 'AUDIT_ENUM_BEFORE_OPS_ACTIONS'));
  return { valid: checks.every((check) => check.passed), sequence: [...EDITORIAL_MIGRATION_SEQUENCE], checks };
}

function dependencyCheck(root: string, migrationIndex: number, requiredToken: string, code: string) {
  const earlierSql = EDITORIAL_MIGRATION_SEQUENCE.slice(0, migrationIndex).map((name) => readSql(root, name)).join('\n');
  return { code, passed: earlierSql.includes(`"${requiredToken}"`), detail: `${requiredToken} must be defined before ${EDITORIAL_MIGRATION_SEQUENCE[migrationIndex]}` };
}

function readSql(root: string, migration: string): string {
  const sqlPath = path.join(root, migration, 'migration.sql');
  return fs.existsSync(sqlPath) ? fs.readFileSync(sqlPath, 'utf8') : '';
}
