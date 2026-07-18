import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
const migration = readFileSync(join(process.cwd(), 'prisma', 'migrations', '20260719010000_add_editorial_review_audit', 'migration.sql'), 'utf8');

describe('editorial review audit schema', () => {
  it('adds an immutable decision log linked to draft, actor and optional Article', () => {
    expect(schema).toContain('model EditorialReviewAuditLog');
    expect(schema).toContain('action         EditorialReviewAuditAction');
    expect(schema).toContain('@relation("EditorialReviewAuditActor"');
    expect(migration).toContain('EditorialReviewAuditLog_draftId_fkey');
    expect(migration).toContain('ON DELETE RESTRICT');
    expect(migration).not.toContain('EditorialReviewAuditLog" DROP');
  });

  it('binds every automated gate to the exact evaluated draft hash', () => {
    expect(schema).toContain('evaluatedContentHash  String');
    expect(migration).toContain('ALTER COLUMN "evaluatedContentHash" SET NOT NULL');
  });
});
