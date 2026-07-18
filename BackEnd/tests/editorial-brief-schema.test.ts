import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
const migration = readFileSync(join(process.cwd(), 'prisma', 'migrations', '20260718210000_add_editorial_source_dossiers', 'migration.sql'), 'utf8');

describe('editorial brief schema contract', () => {
  it('keeps dossiers, frozen evidence and briefs separate from Article', () => {
    expect(schema).toContain('model EditorialSourceDossier');
    expect(schema).toContain('model EditorialBriefEvidence');
    expect(schema).toContain('model EditorialBrief');
    const dossierBlock = schema.slice(schema.indexOf('model EditorialSourceDossier'), schema.indexOf('model EditorialBriefEvidence'));
    expect(dossierBlock).not.toContain('Article');
  });

  it('retains direct document and chunk evidence references with unique constraints', () => {
    expect(schema).toContain('document         IngestedDocument');
    expect(schema).toContain('chunk             DocumentChunk');
    expect(schema).toContain('@@unique([dossierId, chunkId])');
    expect(schema).toContain('@@unique([dossierId, evidenceKey])');
    expect(migration).toContain('EditorialSourceDossier_shadow_only_check');
    expect(migration).toContain('EditorialBrief_shadow_only_check');
  });
});
