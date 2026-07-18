import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
const migration = readFileSync(join(process.cwd(), 'prisma', 'migrations', '20260718230000_add_controlled_editorial_drafts', 'migration.sql'), 'utf8');

describe('controlled editorial draft schema contract', () => {
  it('keeps the intermediate artifact and claims distinct from Article', () => {
    expect(schema).toContain('model EditorialDraft');
    expect(schema).toContain('model EditorialDraftClaim');
    expect(schema).toContain('model EditorialDraftClaimEvidence');
    expect(schema).toContain('model EditorialQualityGate');
    expect(schema).toContain('articleId             String?              @unique');
    expect(schema).toContain('humanReviewStatus     EditorialHumanReviewStatus @default(PENDING)');
  });

  it('enforces approval, scores, article state and immutable reviewer audit constraints', () => {
    expect(migration).toContain('EditorialQualityGate_scores_check');
    expect(migration).toContain('EditorialQualityGate_human_review_check');
    expect(migration).toContain('EditorialQualityGate_approval_requires_pass_check');
    expect(migration).toContain('EditorialDraft_article_state_check');
    expect(migration).toContain('EditorialDraftClaimEvidence_briefEvidenceId_fkey');
    expect(migration).toContain('ON DELETE RESTRICT ON UPDATE CASCADE');
  });
});
