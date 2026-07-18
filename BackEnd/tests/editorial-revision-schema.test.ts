import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
const migration = readFileSync(join(process.cwd(), 'prisma', 'migrations', '20260719030000_add_editorial_draft_revisions', 'migration.sql'), 'utf8');

describe('versioned editorial review schema', () => {
  it('separates revisions, draft decisions and publication authorizations', () => {
    expect(schema).toContain('model EditorialDraftRevision');
    expect(schema).toContain('model EditorialReviewDecision');
    expect(schema).toContain('model EditorialPublicationAuthorization');
    expect(schema).toContain('APPROVE_DRAFT');
    expect(schema).toContain('AUTHORIZE_PUBLICATION');
    expect(schema).toContain('currentRevisionId');
  });

  it('enforces immutable version identity and distinct four-eyes actors at database level', () => {
    expect(migration).toContain('EditorialDraftRevision_draftId_version_key');
    expect(migration).toContain('EditorialPublicationAuthorization_four_eyes_check');
    expect(migration).toContain('"draftApproverId" <> "authorizedById"');
    expect(migration).toContain('EditorialReviewDecision_invalidation_check');
    expect(migration).toContain('EditorialPublicationAuthorization_invalidation_check');
  });

  it('backfills existing controlled drafts without deleting PR8 audit history', () => {
    expect(migration).toContain('INSERT INTO "EditorialDraftRevision"');
    expect(migration).toContain('UPDATE "EditorialReviewAuditLog"');
    expect(migration).not.toContain('DROP TABLE "EditorialReviewAuditLog"');
  });
});
