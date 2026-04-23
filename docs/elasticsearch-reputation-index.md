# Elasticsearch — Reputation Index

## Index name

`reputation_records`

## Mapping

| Field               | ES type              | Notes                                      |
| ------------------- | -------------------- | ------------------------------------------ |
| `address`           | `keyword`            | Stellar G-address (exact match / filter)   |
| `address_suggest`   | `search_as_you_type` | Prefix autocomplete (2-gram, 3-gram)       |
| `tenant_id`         | `keyword`            | Multi-tenant filter                        |
| `total_score`       | `long`               | Primary sort field for leaderboard         |
| `completed_escrows` | `integer`            |                                            |
| `disputed_escrows`  | `integer`            |                                            |
| `disputes_won`      | `integer`            |                                            |
| `total_volume`      | `keyword`            | Stored as string (BigInt-safe)             |
| `last_updated`      | `date`               | ISO-8601                                   |

Settings: `number_of_shards: 1`, `number_of_replicas: 0` (scale replicas in production).

## Sync strategy

- **Startup**: `ensureIndex()` creates the index if absent, then `syncFromPrisma()` bulk-loads all existing records.
- **Daily cron** (3 AM UTC via `workers/scheduler.js`): full re-sync from Prisma to keep ES eventually consistent with on-chain data ingested by the event indexer.
- **Write-through**: `reputationSearchService.indexRecord()` is called whenever a reputation record is created or updated (hook into the event indexer or service layer).

## Fallback behaviour

Every ES query is wrapped in a try/catch. On any ES error the service transparently falls back to an equivalent Prisma query and sets the `X-Data-Source: prisma` response header so clients can observe degraded mode.

## Environment variables

| Variable              | Default                   | Description                          |
| --------------------- | ------------------------- | ------------------------------------ |
| `ELASTICSEARCH_URL`   | `http://localhost:9200`   | ES node URL                          |
| `ELASTICSEARCH_API_KEY` | _(empty)_               | API key for Elastic Cloud / secured  |

## Local development

```bash
docker compose up elasticsearch
```

The ES service is defined in `docker-compose.yml` with a health-check. The backend `depends_on` it so it won't start until ES is ready.
