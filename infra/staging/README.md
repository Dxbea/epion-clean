# Epion editorial staging on an isolated VPS stack

This stack is named `epion-staging`. It has distinct Docker volumes, a private
network, database name and credentials. It never exposes PostgreSQL, Redis or
the API port directly on the host.

## Before deployment

Deploy this checkout in a separate directory, for example `/opt/epion-staging`.
Do not run these commands in the production checkout.

```bash
cd /opt/epion-staging
cp .env.staging.example .env.staging
chmod 600 .env.staging
chmod +x infra/staging/*.sh
./infra/staging/vps-preflight.sh
```

Set real, unique staging secrets in `.env.staging`. In particular, keep all
three `*_AUTOPUBLISH_*` flags false and use an HTTPS feed dedicated to staging.

Create an `A`/`AAAA` DNS record for `api-staging.epion.app` before enabling
Caddy. The public firewall may expose only TCP 80 and 443; leave 5432, 6379
and 5175 closed.

## Edge proxy choice

If the VPS has no existing listener on 80/443, the isolated Caddy profile can
own those ports:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml --profile standalone-edge up -d caddy
```

If production already owns 80/443, do **not** run that command. Keep this
stack private and have the existing edge proxy route `api-staging.epion.app`
to `epion-staging-api:5175` on `epion-staging-internal`, using the prepared
`infra/caddy/Caddyfile.staging` block. That routing change needs separate
approval because it changes the shared production edge configuration.

## Build, database and API

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml build
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d postgres redis
docker compose --env-file .env.staging -f docker-compose.staging.yml --profile tools run --rm epion-tooling npx prisma migrate deploy
docker compose --env-file .env.staging -f docker-compose.staging.yml --profile tools run --rm epion-tooling npm run staging:editorial:migrations
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d epion-api
```

The `epion-tooling` service uses the Dockerfile build stage and is deliberate:
the runtime API image does not include Prisma CLI, `tsx`, or `src/`.

## Workers

Start only the six explicit worker services, in this order. Never start
`start:worker` or an aggregate worker service.

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d worker-document-corpus
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d worker-discovery
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d worker-editorial-shadow
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d worker-editorial-brief
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d worker-editorial-draft
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d worker-editorial-verification
```

Verify the API and readiness:

```bash
curl --fail --silent --show-error https://api-staging.epion.app/api/healthz
docker compose --env-file .env.staging -f docker-compose.staging.yml --profile tools run --rm epion-tooling npm run staging:editorial:readiness
```

`OPS_REPLAY` may remain a warning for this first test because operations
mutations are intentionally disabled.

## Controlled E2E

All write commands require the explicit shadow confirmation token.

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml --profile tools run --rm epion-tooling npm run staging:editorial:seed -- --apply --enable-source --confirm=EPION_STAGING_SHADOW
docker compose --env-file .env.staging -f docker-compose.staging.yml --profile tools run --rm epion-tooling npm run staging:editorial:e2e
docker compose --env-file .env.staging -f docker-compose.staging.yml --profile tools run --rm epion-tooling npm run staging:editorial:e2e -- --advance --confirm=EPION_STAGING_SHADOW
```

Repeat inspection then `--advance` for discovery, document indexing and
clustering. Once a run exists, pass `--run-id=<id>`; once a brief exists, add
`--brief-id=<id>`; then add `--draft-id=<id>`. Approve the draft through the
authenticated ADMIN endpoint before requesting verification. Do not call the
authorization or publication endpoints.

At every stage, inspect state with the same E2E command without `--advance`.
The final state is valid only when the Article remains `DRAFT`, its
`publishedAt` is null and verification records a shadow decision.

## Stop and rollback

Create a backup before a destructive action:

```bash
./infra/staging/backup-staging.sh
```

To halt processing immediately, set all Redis kill switches and stop API and
workers without deleting volumes:

```bash
./infra/staging/rollback-staging.sh
```

To stop the whole stack while preserving the staging data:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml down
```

To restore a known staging dump, the rollback script requires an explicit
confirmation:

```bash
./infra/staging/rollback-staging.sh --restore /opt/epion-staging/backups/postgres/epion-staging-YYYYMMDD-HHMMSS.dump
```

Prisma has no safe generic automatic migration rollback. Restore the database
backup for schema rollback, or deploy a separately reviewed reversible
migration.
