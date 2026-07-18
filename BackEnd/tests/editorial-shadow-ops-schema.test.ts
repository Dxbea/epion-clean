import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('editorial shadow operations audit schema', () => {
  const schema = fs.readFileSync(path.resolve('prisma/schema.prisma'), 'utf8');
  const migration = fs.readFileSync(path.resolve('prisma/migrations/20260720100000_add_editorial_shadow_ops_audit/migration.sql'), 'utf8');
  it('adds versioned operations and a unique idempotency key additively', () => {
    expect(schema).toContain('VERIFICATION_REPLAYED');
    expect(schema).toContain('VERIFICATION_DLQ_REPLAYED');
    expect(schema).toContain('VERIFICATION_RECONCILED');
    expect(schema).toContain('operationKey   String?                    @unique');
    expect(migration).toContain('EditorialReviewAuditLog_operationKey_key');
    expect(migration).not.toContain('UPDATE "Article"');
  });
});
