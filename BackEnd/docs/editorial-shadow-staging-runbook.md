# Epion editorial shadow staging runbook

This runbook activates the PR1–PR14 editorial pipeline in staging only. It must never publish an Article. The controlled E2E follows `EDITORIAL_VALIDATION_MODE`: the default human workflow stops for approval, while the explicit `quality_gate` mode can advance a passed gate automatically and only records a shadow decision.

## Safety contract

- `NODE_ENV=staging` is mandatory for every write-capable staging CLI.
- `EDITORIAL_AUTOPUBLISH_ENABLED`, `EDITORIAL_AUTO_PUBLISH_ENABLED` and `AUTO_PUBLISH_ENABLED` must be absent or `false`.
- Every staging CLI is read-only by default.
- A write requires both `--advance` or `--apply` and `--confirm=EPION_STAGING_SHADOW`.
- Workers are standalone processes. Neither the API nor `start:worker` starts the six editorial workers below.
- Do not invoke the manual publication endpoint during the shadow exercise.

## Required infrastructure and secrets

Required:

- PostgreSQL supported by the current Prisma client;
- the PostgreSQL `vector` extension;
- Redis compatible with BullMQ;
- `DATABASE_URL` and `REDIS_URL`;
- `OPENAI_API_KEY` for embeddings, briefs, drafts and TrustScore enrichment;
- `MISTRAL_API_KEY` for the independent audit;
- `SERPER_API_KEY` for conditional external enrichment;
- one existing Better Auth user with `ADMIN` role;
- an HTTPS RSS fixture/feed in `STAGING_EDITORIAL_FEED_URL`.

Required for the final strict readiness check (inject the cookie ephemerally):

- `STAGING_ADMIN_OVERVIEW_URL=https://<staging-host>/api/admin/editorial-ops/overview`;
- `STAGING_ADMIN_SESSION_COOKIE`, supplied from the staging secret manager and never committed or printed.

## Shadow flags

Start with all kill switches active. Change one layer at a time.

```text
DISCOVERY_ENABLED=true
DISCOVERY_SCHEDULER_ENABLED=false
DISCOVERY_KILL_SWITCH=false

DOCUMENT_PIPELINE_ENABLED=true
DOCUMENT_PIPELINE_KILL_SWITCH=false

EDITORIAL_SHADOW_ENABLED=true
EDITORIAL_SHADOW_KILL_SWITCH=false

EDITORIAL_BRIEF_ENABLED=true
EDITORIAL_BRIEF_KILL_SWITCH=false

EDITORIAL_DRAFT_ENABLED=true
EDITORIAL_DRAFT_KILL_SWITCH=false

EDITORIAL_VERIFICATION_WORKER_ENABLED=true
EDITORIAL_VERIFICATION_KILL_SWITCH=false

EDITORIAL_SHADOW_CALIBRATION_ENABLED=true
EDITORIAL_SHADOW_OPS_MUTATIONS_ENABLED=false
EDITORIAL_SHADOW_OPS_KILL_SWITCH=true

EDITORIAL_AUTOPUBLISH_ENABLED=false
```

Enable controlled replay only after normal jobs have completed successfully:

```text
EDITORIAL_SHADOW_OPS_MUTATIONS_ENABLED=true
EDITORIAL_SHADOW_OPS_KILL_SWITCH=false
```

Redis kill-switch keys must also be `off`:

```text
epion:discovery:kill-switch
epion:document-corpus:kill-switch
epion:editorial-shadow:kill-switch
epion:editorial-brief:kill-switch
epion:editorial-draft:kill-switch
epion:editorial-verification:kill-switch
```

## Migration validation and deployment

From `BackEnd`:

```powershell
npm ci
npm run staging:editorial:migrations
npx prisma validate
npx prisma migrate status
npx prisma migrate deploy
npm run db:gen
npm run build
```

The editorial sequence is additive and ordered:

1. discovery corpus foundation;
2. repeated-discovery observation state;
3. document extraction, chunks and pgvector embeddings;
4. shadow clustering and candidates;
5. dossiers, evidence and briefs;
6. controlled drafts and quality gates;
7. admin review audit;
8. revisions and four-eyes authorization;
9. manual publication support;
10. Serper/Mistral verification runs;
11. asynchronous verification budgets and shadow decision;
12. shadow operations audit and replay idempotency.

`pgvector` is created by an earlier migration before any PR1–PR14 vector column. Do not use `prisma db push`, reset, or edit an applied migration.

## Seed the controlled source

Preview only:

```powershell
npm run staging:editorial:seed
```

Create the Source and a disabled DiscoverySource:

```powershell
npm run staging:editorial:seed -- --apply --confirm=EPION_STAGING_SHADOW
```

Enable it only when the discovery worker is healthy:

```powershell
npm run staging:editorial:seed -- --apply --enable-source --confirm=EPION_STAGING_SHADOW
```

## Worker activation order

Start every command in a separate supervised process after `npm run build`:

1. `npm run worker:document-corpus`
2. `npm run worker:discovery`
3. `npm run worker:editorial-shadow`
4. `npm run worker:editorial-brief`
5. `npm run worker:editorial-draft`
6. `npm run worker:editorial-verification`

Keep `DISCOVERY_SCHEDULER_ENABLED=false` for the first exercise. Discovery is triggered manually by the controlled E2E. The legacy `worker:news`, the combined `start:worker`, embedding, source-enrichment and live-analysis workers are not substitutes for these six processes.

Run the non-strict readiness check after all six workers have registered with BullMQ:

```powershell
npm run staging:editorial:readiness
```

After configuring the authenticated admin probe and enabling controlled replay, require a completely green report:

```powershell
npm run staging:editorial:readiness -- --strict
```

## Controlled E2E

Inspection is read-only:

```powershell
npm run staging:editorial:e2e
```

Advance exactly one deterministic stage per invocation:

```powershell
npm run staging:editorial:e2e -- --advance --confirm=EPION_STAGING_SHADOW
```

The CLI returns the next required identifier. Continue with the explicit identifiers:

```powershell
npm run staging:editorial:e2e -- --run-id=<EditorialRun.id> --advance --confirm=EPION_STAGING_SHADOW
npm run staging:editorial:e2e -- --run-id=<EditorialRun.id> --brief-id=<EditorialBrief.id> --advance --confirm=EPION_STAGING_SHADOW
npm run staging:editorial:e2e -- --run-id=<EditorialRun.id> --brief-id=<EditorialBrief.id> --draft-id=<EditorialDraft.id> --advance --confirm=EPION_STAGING_SHADOW
```

With the default `EDITORIAL_VALIDATION_MODE=human_review`, the draft stage stops at `WAITING_HUMAN_APPROVAL`; an ADMIN must inspect and approve the current revision through the private admin workflow before verification can be enqueued. With `EDITORIAL_VALIDATION_MODE=quality_gate`, a `PASSED` quality gate and `GATE_PASSED` current revision materialize an Article in `DRAFT` and allow verification to be enqueued without human approval; a failed gate remains `QUALITY_GATE_BLOCKED`. The CLI process must inherit the same validation-mode environment as the workers. Completion requires an `EditorialVerificationRun.shadowDecision` of `WOULD_AUTO_PUBLISH`, `WOULD_REQUIRE_HUMAN` or `WOULD_REJECT`. The Article must remain `DRAFT` throughout.

## Tests and observations

```powershell
npm run build
npm test -- tests/editorial-staging-readiness.test.ts tests/editorial-staging-seed.test.ts tests/editorial-staging-e2e.test.ts tests/editorial-migration-audit.test.ts
npm test -- tests/editorial-verification-worker.test.ts tests/editorial-shadow-ops-actions.test.ts tests/editorial-shadow-ops-alerts.test.ts
git diff --check -- BackEnd
```

Monitor `/api/admin/editorial-ops/overview`, `/alerts`, `/jobs`, `/dlq`, `/serper-documents` and `/calibration`. Stop the exercise for a non-empty DLQ, stalled queue, provider outage, exhausted budget, migration drift, missing source identity, or any Article no longer in `DRAFT`.

## Rollback and emergency stop

1. Set every editorial/discovery kill switch to `true` and the six Redis keys above to `on`.
2. Stop the six standalone worker processes.
3. Disable the staging DiscoverySource:

```powershell
npm run staging:editorial:seed -- --apply --disable-source --confirm=EPION_STAGING_SHADOW
```

4. Leave queued jobs intact for diagnosis; do not delete queues or DLQ entries.
5. Keep all Articles in `DRAFT`; revoke any manual publication authorization if one was created outside this runbook.
6. Roll back the application version if required. Do not roll back additive migrations after they have been applied; use a forward corrective migration.
7. Export the admin ops overview, relevant audit rows and worker logs for the incident review.

## PR15 acceptance gate

PR15 may be considered only when every criterion below is evidenced from staging:

- all 12 editorial migrations are applied with no Prisma drift and the strict readiness report is green;
- at least 14 consecutive days and at least 100 completed shadow verification runs are available;
- zero Article has been moved from `DRAFT` by the shadow pipeline;
- every `WOULD_AUTO_PUBLISH` has been reviewed by an ADMIN during calibration, with zero unsupported central claim, invalid citation, sensitive-topic escape or material contradiction;
- every `WOULD_AUTO_PUBLISH` has at least three durable sources from three independent domains, Mistral `PASSED`, FactScore at least 85, quality at least 85 and publishability at least 85;
- health, elections, war, sensitive finance and accusations have produced zero `WOULD_AUTO_PUBLISH` decisions;
- provider and technical fail-closed runs remain below 5% over seven days, excluding deliberate outage drills;
- no queue has remained stalled for more than 30 minutes and no unexplained DLQ job has remained open for more than 24 hours;
- normal daily usage remains below 80% of every configured provider and cost budget;
- replay idempotence, Redis kill switches, worker shutdown and the rollback procedure have each been exercised successfully;
- the operations review records a formal go/no-go decision and freezes the exact shadow policy version and thresholds proposed for PR15.

Any failed criterion keeps the system in shadow mode. A high volume of `WOULD_AUTO_PUBLISH` decisions alone is not an acceptance signal.
