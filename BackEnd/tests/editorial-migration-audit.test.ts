import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditEditorialMigrationFiles, EDITORIAL_MIGRATION_SEQUENCE } from '../src/lib/editorial-staging/migration-audit.js';

describe('PR1–PR14 editorial migration audit', () => {
  it('proves the checked-in sequence and pgvector dependency are coherent', () => {
    const report = auditEditorialMigrationFiles(path.resolve('prisma/migrations'));
    expect(report.valid).toBe(true);
    expect(report.sequence).toEqual([...EDITORIAL_MIGRATION_SEQUENCE]);
    expect(report.checks.every((check) => check.passed)).toBe(true);
  });

  it('fails closed when migrations are absent', () => {
    expect(auditEditorialMigrationFiles(path.resolve('tests/fixtures/editorial')).valid).toBe(false);
  });
});
