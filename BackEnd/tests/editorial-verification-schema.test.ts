import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = fs.readFileSync(path.resolve('prisma/schema.prisma'), 'utf8');
const migration = fs.readFileSync(path.resolve('prisma/migrations/20260719100000_add_editorial_verification_runs/migration.sql'), 'utf8');
const asyncMigration = fs.readFileSync(path.resolve('prisma/migrations/20260719120000_add_editorial_verification_async_shadow/migration.sql'), 'utf8');

describe('editorial verification persistence schema', () => {
  it('stores an auditable idempotent verification run linked to draft, revision and Article', () => {
    expect(schema).toContain('enum EditorialVerificationStatus');
    expect(schema).toContain('model EditorialVerificationRun');
    expect(schema).toContain('idempotencyKey        String                      @unique');
    expect(schema).toContain('serperDocumentIds     Json?');
    expect(schema).toContain('mistralAudit          Json?');
    expect(schema).toContain('factCheckContentHash  String?');
  });

  it('ships an additive migration with foreign keys and indexes', () => {
    expect(migration).toContain('CREATE TABLE "EditorialVerificationRun"');
    expect(migration).toContain('CREATE UNIQUE INDEX "EditorialVerificationRun_idempotencyKey_key"');
    expect(migration).toContain('REFERENCES "EditorialDraftRevision"("id")');
    expect(migration).toContain('REFERENCES "Article"("id")');
  });

  it('persists shadow decisions and atomic daily usage without changing Article status', () => {
    expect(schema).toContain('enum EditorialShadowPublicationDecision');
    expect(schema).toContain('shadowDecision');
    expect(schema).toContain('model EditorialVerificationDailyUsage');
    expect(asyncMigration).toContain('CREATE TYPE "EditorialShadowPublicationDecision"');
    expect(asyncMigration).toContain('CREATE TABLE "EditorialVerificationDailyUsage"');
    expect(asyncMigration).not.toContain('UPDATE "Article"');
  });
});
