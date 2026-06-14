# Agent Instructions

## Package Manager
Use npm with per-package lockfiles.

| Area | Commands |
|------|----------|
| Frontend | `cd Frontend && npm install && npm run dev && npm run build` |
| Backend | `cd Backend && npm install && npm run dev && npm run build && npm test` |
| Prisma | `cd Backend && npm run db:gen && npm run db:migrate && npm run db:studio` |

## Repository Map
- `Frontend/src/pages`: page-level React views.
- `Frontend/src/components`: shared UI, chat, article, account, settings components.
- `Frontend/src/i18n/dict.ts`: FR/EN copy source.
- `Frontend/src/lib/score-labels.ts`, `Frontend/src/lib/source-ui.ts`: display-only score/source helpers.
- `Backend/src/routes`: Express API routes.
- `Backend/src/lib`: auth/session, billing, RAG, scoring, trust, rate limiting, CSRF.
- `Backend/src/workers`: BullMQ workers for embeddings, source enrichment, live analysis, news ingestion.
- `Backend/prisma/schema.prisma`: database schema and Prisma enums/models.
- `docs/product/epion_bible_v2.md`, `BUSINESS_LOGIC.md`: product and business constraints.

## Product Constraints
- Epion helps users verify, understand, and discuss information.
- Prefer clarity, source transparency, progressive depth, factual explanation, and structured understanding.
- Do not optimize for infinite-feed behavior, blind summarization, or unsupported AI authority.
- Ask: does this help the user better understand information?

## Frontend
- Use existing React + Vite + TypeScript + Tailwind patterns.
- Keep layouts consistent with `Header`, `Footer`, `MainLayout`, Chat, Article, Settings, and Account surfaces.
- Add user-facing copy in both French and English through `Frontend/src/i18n/dict.ts`.
- The frontend displays scores; it must not become the source of truth for score computation.
- Preserve source transparency UI: citations, source cards, trust modals, and support-level wording.

## Backend API
- Inspect existing route, service, Prisma, and response shapes before changing behavior.
- Keep API responses explicit and minimal.
- Validate and sanitize inputs; use existing helpers such as `sanitizeArticleHtml`, `requireSession`, `csrfRequired`, and rate limit utilities.
- Do not expose debug, admin, token, or unsafe diagnostic routes in production.

## Prisma
- Schema lives in `Backend/prisma/schema.prisma`.
- Subscription/usage logic uses `PlanType` and `UserUsage`; user profile tier also has `SubscriptionTier`.
- Article score fields are `factCheckScore`, `factCheckData`, `factCheckStatus`, and `factCheckContentHash`.
- RAG indexing uses `KnowledgeChunk.embedding Unsupported("vector(1536)")`.
- Run `cd Backend && npm run db:gen` after schema changes.

## AI, RAG, And Billing
- Check plan/credits before AI or article-generation work.
- Use `Backend/src/lib/billing-service.ts` for Epion Energy costs, daily credits, and weekly article quotas.
- Premium/deep web access must be enforced server-side, not only in the UI.
- RAG logic lives in `Backend/src/lib/rag-service.ts`; embeddings use `text-embedding-3-small`.
- Chat flow should keep source-backed answers, citations, limited history, and explicit fallback behavior.

## Score System
- Backend score helpers in `Backend/src/lib/score-helpers.ts` are the source of truth.
- Source = TrustScore, Article = FactScore, Chat answer = AnswerScore.
- Never present scores as truth percentages.
- Use support labels: `Très solide`, `Solide`, `À nuancer`, `Fragile`, `À vérifier`, `Appui non évalué`.
- Preserve status lifecycle: `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `STALE`.

## Security
- Treat auth, sessions, CSRF, cookies, rate limiting, billing, AI calls, uploads, and admin routes as sensitive.
- Do not log secrets, tokens, raw credentials, or unnecessary user data.
- Production-only protections must stay active: secure session behavior, debug-route gating, CORS allowlist, Helmet, and env validation.
- Use `trash` for deletions; never use `rm -rf`.

## Verification
| Area | Command |
|------|---------|
| Frontend build | `cd Frontend && npm run build` |
| Backend build | `cd Backend && npm run build` |
| Backend tests | `cd Backend && npm test` |
| Backend single test | `cd Backend && npm test -- tests/score-helpers.test.ts` |
| Prisma client | `cd Backend && npm run db:gen` |

## Commit Attribution
AI commits MUST include a short and clear text explaining everything made.
