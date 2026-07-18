import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('editorial shadow Prisma separation contract', () => {
  const schemaPath = fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url));
  const schema = readFileSync(schemaPath, 'utf8');
  const migration = readFileSync(fileURLToPath(new URL(
    '../prisma/migrations/20260718180000_add_editorial_shadow_clustering/migration.sql',
    import.meta.url,
  )), 'utf8');

  it('defines run-scoped topics, topic documents and shadow candidates', () => {
    expect(schema).toContain('model EditorialRun {');
    expect(schema).toContain('model EditorialTopic {');
    expect(schema).toContain('model EditorialTopicDocument {');
    expect(schema).toContain('model EditorialCandidate {');
    expect(schema).toMatch(/model EditorialRun[\s\S]*idempotencyKey\s+String\s+@unique/);
    expect(schema).toMatch(/model EditorialTopic[\s\S]*@@unique\(\[runId, clusterKey\]\)/);
    expect(schema).toMatch(/model EditorialTopicDocument[\s\S]*@@unique\(\[topicId, documentId\]\)/);
    expect(schema).toMatch(/model EditorialTopic[\s\S]*centroidEmbedding\s+Unsupported\("vector\(1536\)"\)\?/);
  });

  it('contains no Article relation in any editorial model', () => {
    for (const model of ['EditorialRun', 'EditorialTopic', 'EditorialTopicDocument', 'EditorialCandidate']) {
      const block = schema.match(new RegExp(`model ${model} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? '';
      expect(block).not.toMatch(/\bArticle\b/);
    }
  });

  it('makes shadow-only states explicit', () => {
    expect(schema).toMatch(/enum EditorialRunMode \{\s+SHADOW\s+\}/);
    expect(schema).toContain('SHADOW_PROPOSED');
    expect(schema).toContain('SHADOW_SUPPRESSED');
    expect(schema).toMatch(/model EditorialCandidate[\s\S]*shadowOnly\s+Boolean\s+@default\(true\)/);
    expect(migration).toContain('EditorialRun_shadow_mode_check');
    expect(migration).toContain('EditorialCandidate_shadow_only_check');
    expect(migration).toContain('EditorialCandidate_scores_check');
  });
});
