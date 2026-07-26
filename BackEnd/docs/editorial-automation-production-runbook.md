# Editorial automation production runbook

## Controlled production profile

Use `BackEnd/.env.production.controlled.example` as the non-secret reference and
merge its values into `.env.production`.

Exactly one low-cost radar is enabled in the controlled default profile:

```dotenv
EDITORIAL_GDELT_DISCOVERY_ENABLED=true
EDITORIAL_GDELT_DISCOVERY_KILL_SWITCH=false
EDITORIAL_GDELT_MAX_QUERIES_PER_RUN=1
EDITORIAL_GDELT_MAX_RESULTS_PER_RUN=10

EDITORIAL_GOOGLE_NEWS_DISCOVERY_ENABLED=false
EDITORIAL_GOOGLE_NEWS_DISCOVERY_KILL_SWITCH=true
EDITORIAL_GOOGLE_NEWS_MAX_QUERIES_PER_RUN=1
EDITORIAL_GOOGLE_NEWS_MAX_RESULTS_PER_RUN=10
```

The database must contain an enabled, unblocked `DiscoverySource` with
`connectorType=GDELT`. Its configured query list is truncated to one query and
the connector returns at most ten results per run. GDELT results remain radar
candidates: publisher pages must still pass the normal robots, extraction,
persistence, indexing and evidence gates.

Google News may replace GDELT, but the two radar profiles should not be enabled
together for the controlled launch. Serper remains an optional complement.

## Readiness

Do not create, delete or toggle Redis keys during this procedure. Missing keys
and explicit inactive values (`0`, `false`, `off`) are accepted. Any active
pipeline kill switch remains a hard NO-GO.

```bash
docker compose -f docker-compose.prod.yml run --rm -T \
  worker-editorial-automation \
  npm run editorial:automation:readiness
```

The result must contain:

```text
go = true
EDITORIAL_RADARS = PASS
EDITORIAL_RADAR_BUDGET = PASS
```

`EDITORIAL_RADARS=FAIL` means neither GDELT nor Google News is both enabled by
environment and available as an enabled database source.

`EDITORIAL_RADAR_BUDGET=FAIL` means the active radar exceeds one query or ten
results per run.

## Controlled publication

Only run this after readiness returns `go=true`. The command can publish at
most one article for the UTC day.

```bash
docker compose -f docker-compose.prod.yml run --rm -T \
  worker-editorial-automation \
  npm run editorial:automation:publish-once -- \
  --confirm=EPION_EDITORIAL_PUBLISH_ONE \
  --wait-ms=1800000 \
  --indexed-lookback-hours=24
```

If the radar, evidence, brief, draft, verification or publication gates fail,
the command returns `validated=false` with structured blocking reasons.
