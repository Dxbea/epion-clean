# Epion

**Understand information. Don’t just consume it.**

Epion is an AI-powered media-tech platform designed to help people verify, understand, and discuss information.

Instead of simply aggregating or shortening news, Epion focuses on how information is built: which sources support it, what is established, what remains uncertain, and which perspectives deserve further examination.

> Epion is not another source of information. It is a layer of understanding between the user and the information.

---

## Core principles

Epion is built around three actions:

### Verify

Make sources, methods, limitations, and uncertainty visible.

### Understand

Turn fragmented information into clear, structured, contextualized explanations.

### Discuss

Create a social layer where users can question, share, and discuss information with more context and less noise.

---

## Main features

### Structured articles

Explore AI-assisted articles designed to make complex topics easier to understand through context, sources, perspectives, and explicit uncertainty.

### AI chat

Ask questions, investigate a topic, and receive sourced answers through fast and web-assisted modes.

### Transparent source analysis

Inspect the sources used for an article or response, their general reliability, known bias indicators, and their role in supporting the content.

### Support levels

Epion does not present a score as a probability of truth.

The scoring system estimates how strongly a piece of content is supported by its sources and by the analysis performed.

The main concepts are:

- **TrustScore** — general reliability of a source or domain
- **FactScore** — support level of an article
- **AnswerScore** — support level of an AI-generated answer
- **Bias indicators** — information about framing or political orientation, kept separate from reliability

Public-facing labels include:

- Very strong
- Strong
- Needs nuance
- Fragile
- Needs verification
- Support not evaluated

### Social layer

Epion includes comments, reactions, reposts, saved articles, public profiles, follows, and activity feeds.

The goal is not to reproduce the engagement model of traditional social networks, but to extend understanding through discussion.

---

## Product philosophy

Epion is based on a simple observation:

Information is no longer difficult to access. What is difficult is understanding it correctly.

People are exposed to a constant stream of articles, posts, videos, summaries, and opinions. The result is often more consumption, but not necessarily more understanding.

Epion aims to reduce that gap by helping users identify:

- what is established
- what is interpreted
- what remains uncertain
- which sources support the content
- how those sources are used
- which perspectives or limitations should be considered

The platform does not attempt to impose an opinion or claim perfect neutrality.

Its role is to make the construction of information more visible.

---

## Current product architecture

Epion is organized as a full-stack application with a frontend, an API, background workers, a relational database, and AI-assisted analysis pipelines.

### Frontend

- React 19
- Vite 7
- TypeScript
- Tailwind CSS
- React Router
- i18next
- Sentry

### Backend

- Node.js
- Express
- TypeScript
- Prisma ORM
- PostgreSQL
- pgvector
- Redis
- BullMQ

### AI and information retrieval

- OpenAI
- Mistral
- Serper
- Tavily
- Retrieval-Augmented Generation
- Web search and source extraction
- Source enrichment and trust analysis
- Embedding-based article indexing

---

## Repository structure

```text
epionweb/
├── FrontEnd/
│   └── src/
│       ├── pages/
│       ├── components/
│       ├── api/
│       ├── contexts/
│       ├── hooks/
│       ├── lib/
│       ├── routes/
│       └── styles/
│
├── BackEnd/
│   ├── prisma/
│   │   └── schema.prisma
│   └── src/
│       ├── routes/
│       ├── services/
│       ├── workers/
│       ├── middleware/
│       ├── controllers/
│       ├── config/
│       └── lib/
│
└── README.md
```

---

## Main backend systems

### Article pipeline

Articles can be created manually or generated through an AI-assisted analysis pipeline.

The article lifecycle includes:

- creation
- source collection
- live analysis
- source enrichment
- support-level calculation
- embedding generation
- publication

### Chat pipeline

The chat supports multiple modes:

- **Fast mode** — internal retrieval and lightweight generation
- **Web mode** — live web search, source extraction, streamed response, and source enrichment

Responses are streamed using Server-Sent Events.

### Score consolidation

The backend is the single source of truth for score calculation.

The database stores the result, and the frontend only formats and displays it.

The article score lifecycle supports:

- `PENDING`
- `RUNNING`
- `COMPLETED`
- `FAILED`
- `STALE`

When an analyzed article changes, its previous score is marked as stale.

### Background workers

Epion uses BullMQ workers for:

- article embeddings
- source enrichment
- live analysis
- news ingestion

---

## Getting started

### Prerequisites

Install:

- Node.js
- npm
- PostgreSQL
- Redis

You will also need the required API keys and environment variables for the services used by the project.

### 1. Clone the repository

```bash
git clone <repository-url>
cd epionweb
```

### 2. Install backend dependencies

```bash
cd BackEnd
npm install
```

### 3. Configure backend environment variables

Create a local environment file based on the example provided in the repository:

```bash
cp .env.example .env
```

Then configure the required values for:

- PostgreSQL
- Redis
- JWT and session secrets
- CSRF secret
- OpenAI
- Mistral
- Serper
- Tavily
- email delivery
- Sentry, when enabled

### 4. Prepare the database

```bash
npm run db:gen
npm run db:migrate:dev
```

`npm run db:migrate:dev` uses `prisma migrate dev` and is only for local development databases. Do not use it for staging or production.

### Database migration commands

- Local development: `cd BackEnd && npm run db:gen && npm run db:migrate:dev`.
- CI tests: GitHub Actions uses a disposable PostgreSQL service database and runs `npm run db:deploy` before backend tests. The optional `npm run db:push:ci` script is reserved for throwaway CI databases only and must not be used against persistent staging or production data.
- Staging and production: set `DATABASE_URL` to the target persistent database, then run `cd BackEnd && npm run db:deploy`. This runs `prisma migrate deploy`, applies only committed migration files, and exits non-zero if a migration cannot be applied.
- Migration status: set `DATABASE_URL` to the database to inspect, then run `cd BackEnd && npm run db:status`.

Never deploy a persistent database with `prisma migrate dev` or `prisma db push`. Create and review migration files locally, commit them, then apply them to staging and production with `npm run db:deploy`.

### 5. Start the backend

Use the development script defined in `BackEnd/package.json`:

```bash
npm run dev
```

The local API is typically available at:

```text
http://localhost:5175
```

### 6. Install frontend dependencies

In another terminal:

```bash
cd FrontEnd
npm install
```

### 7. Start the frontend

```bash
npm run dev
```

The local frontend is typically available at:

```text
http://localhost:5173
```

### 8. Start background workers

The AI, ingestion, enrichment, and embedding pipelines depend on the worker scripts defined in `BackEnd/package.json`.

Run the relevant workers in separate terminals when testing those systems locally.

---

## Tests

Backend tests use Vitest.

```bash
cd BackEnd
npm test
```

The score consolidation system includes tests for:

- article score calculation
- answer score calculation
- support-level derivation
- score payload normalization
- analysis input hashing
- legacy payload compatibility

Build checks:

```bash
cd BackEnd
npm run build
```

```bash
cd FrontEnd
npm run build
```

---

## Beta priorities

The current beta roadmap focuses on consolidation rather than adding large new feature sets.

1. Security and stability
2. FactScore, TrustScore, and AnswerScore consistency
3. Structured article format
4. Chat quality and source grounding
5. Restricted beta testing
6. Progressive social features
7. Mobile readiness

The beta should prove one clear user journey:

> Discover a topic → understand the essentials → inspect the sources → explore with AI → discuss with more context.

---

## Long-term vision

Epion may later introduce an open investigation module.

The objective would be to let users contribute sources, evidence, documents, analyses, and counterpoints through a strict publication protocol and peer-review process.

This is not part of the initial beta. It requires a mature community, strong moderation, traceability, and clear contribution rules.

---

## Positioning

Epion is not intended to become:

- another infinite news feed
- a generic AI summarizer
- a traditional media outlet with an AI layer
- a social network optimized for outrage
- a tool claiming to calculate truth as a percentage
- a clone of Ground News or other news aggregators

The central product question is:

> Does this help the user understand the information better?

---

## Status

Epion is currently under active development and is not yet a finished public product.

Some features, APIs, internal contracts, and setup steps may change before the beta release.

---

## Contributing

The project is currently developed as a private product.

Contribution guidelines will be added when external contributions are opened.

---

## License

No public license has been defined yet.

All rights reserved unless stated otherwise.
