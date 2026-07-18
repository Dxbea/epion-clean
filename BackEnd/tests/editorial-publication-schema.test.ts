import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
const migration = readFileSync(join(process.cwd(), 'prisma', 'migrations', '20260719050000_add_manual_editorial_publication', 'migration.sql'), 'utf8');

describe('manual editorial publication schema', () => {
  it('adds publication time and a renewable authorization lifecycle', () => {
    expect(schema).toContain('publishedAt DateTime?');
    expect(schema).toContain('expiresAt         DateTime');
    expect(schema).toContain('CONSUMED');
    expect(schema).toContain('REVOKED');
    expect(schema).toContain('EXPIRED');
    expect(schema).toContain('publicationAuthorizations EditorialPublicationAuthorization[]');
  });

  it('removes the one-authorization-ever constraint but keeps one active authorization per revision', () => {
    expect(migration).toContain('DROP INDEX "EditorialPublicationAuthorization_revisionId_key"');
    expect(migration).toContain('EditorialPublicationAuthorization_one_active_per_revision_key');
    expect(migration).toContain('WHERE "status" = \'AUTHORIZED\'');
  });

  it('enforces terminal authorization state consistency and audit actions', () => {
    expect(migration).toContain('EditorialPublicationAuthorization_lifecycle_check');
    expect(migration).toContain("\"status\" = 'CONSUMED'");
    expect(schema).toContain('ARTICLE_PUBLISHED');
    expect(schema).toContain('PUBLICATION_REVOKED');
    expect(schema).toContain('PUBLICATION_EXPIRED');
  });
});
