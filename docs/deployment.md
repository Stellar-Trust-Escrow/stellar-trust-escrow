# Deployment Guide

This document explains how to deploy Stellar Trust Escrow in a self-hosted or production environment. It covers host requirements, Docker Compose setup, environment variables, database migrations, Stellar mainnet vs testnet configuration, TLS termination, reverse proxy setup, go-live checks, and smoke tests.

## 1. Server requirements

### Recommended production minimums

- CPU: 4 vCPUs minimum
- RAM: 8 GB minimum
- Disk: 100 GB minimum, SSD storage
- OS: Linux x86_64 (Ubuntu 22.04 LTS, Debian 12, or similar)
- Additional services:
  - PostgreSQL 15+ or compatible database service
  - Redis 7+ for caching, queues, and locking
  - Elasticsearch 8+ for search and reputation indexing
  - Optional external IPFS gateway if evidence storage is required

### Sizing guidance

- Small deployment: 4 vCPU, 8 GB RAM, 100 GB disk
- Medium deployment: 8 vCPU, 16 GB RAM, 200 GB disk
- High-traffic deployment: 16+ vCPU, 32+ GB RAM, 500+ GB disk

Elasticsearch is the most memory-sensitive component. If you run Elasticsearch on the same host as the backend, allocate at least 8 GB RAM for it alone.

### Operating system and runtime

- Use a supported Linux distribution with a current kernel.
- Install Docker Engine and Docker Compose (or Docker Compose V2 via `docker compose`).
- Install Node.js 20 if you build or run the backend/frontend without Docker.

## 2. Docker Compose production setup

The repository includes a development Docker Compose file under `docker-compose.yml`. That file is designed for local development and includes services such as a local Stellar Quickstart sandbox.

### Recommended production service layout

For production, deploy only:

- `postgres` / external PostgreSQL service
- `redis` / external Redis service
- `elasticsearch` / external Elasticsearch service
- `backend` service
- `frontend` service

Do not deploy the local `stellar` or `soroban-sandbox` services in production.

### Building images

The repository `Dockerfile` supports multiple stages:

- `backend` stage: final Node image for the backend server
- `frontend` stage: final Node image for the frontend app

Build images with Docker build args if needed, or use the `BUILD_TYPE` stage selector:

```bash
docker build --target backend -t stellar-trust-escrow-backend .
docker build --target frontend -t stellar-trust-escrow-frontend .
```

### Running backend and frontend with Docker Compose

A production-ready Compose setup should supply platform-grade environment variables and avoid the local Stellar sandbox.

Example command for production-style startup:

```bash
docker compose -f docker-compose.yml up -d postgres redis elasticsearch backend frontend
```

However, the repository's `docker-compose.yml` file is not production-ready as-is; it still exposes the local Stellar sandbox and uses default credentials. We recommend creating a separate `docker-compose.prod.yml` that:

- removes `stellar` and `soroban-sandbox`
- does not expose internal ports beyond what the reverse proxy needs
- configures backend and frontend environment variables securely
- optionally deploys separate logging or monitoring containers

### Recommended production network layout

- Frontend: publicly available via TLS reverse proxy
- Backend: internal API service behind reverse proxy
- PostgreSQL: private network only
- Redis: private network only
- Elasticsearch: private network only

## 3. Environment variables

### Required backend environment variables

The backend validates required variables via `scripts/check-env.js`. Required values include:

- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `JWT_SECRET` — access token signing secret
- `JWT_REFRESH_SECRET` — refresh token signing secret
- `MFA_SECRET` — MFA signing secret
- `STELLAR_NETWORK` — `testnet` or `mainnet`
- `SOROBAN_RPC_URL` — Soroban RPC endpoint
- `CONTRACT_ID` — deployed escrow contract Stellar address

The example backend environment file is `backend/.env.example`.

### Important production secrets

- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `MFA_SECRET`
- `ADMIN_API_KEY`
- `SENTRY_DSN` and Sentry release metadata
- `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY`, `SUMSUB_BASE_URL`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `PINATA_JWT`
- `ELASTICSEARCH_API_KEY`
- `VAULT_*` credentials if using `SECRETS_BACKEND=vault`

### Secrets backend

The backend supports a secrets backend via `SECRETS_BACKEND`.

- `SECRETS_BACKEND=env` reads values from the environment.
- `SECRETS_BACKEND=vault` uses HashiCorp Vault configuration:
  - `VAULT_ADDR`
  - `VAULT_ROLE_ID`
  - `VAULT_SECRET_ID`
  - `VAULT_TOKEN`
  - `VAULT_KV_PATH`
  - `VAULT_NAMESPACE`

If you use Vault, do not store production secrets in plaintext files.

### Default application environment variables

Use a frontend `.env.local` or external environment for values such as:

- `NEXT_PUBLIC_API_URL` — public backend base URL
- `NEXT_PUBLIC_STELLAR_NETWORK` — `testnet` or `mainnet`
- `NEXT_PUBLIC_CONTRACT_ADDRESS` — deployed contract address
- `NEXT_PUBLIC_SOROBAN_RPC_URL` — public Soroban RPC endpoint

### Example backend production variables

```env
DATABASE_URL=postgresql://escrow_user:strongpassword@postgres:5432/stellar_escrow
REDIS_URL=redis://redis:6379
ELASTICSEARCH_URL=http://elasticsearch:9200
STELLAR_NETWORK=mainnet
SOROBAN_RPC_URL=https://soroban-mainnet.stellar.org
STELLAR_HORIZON_URL=https://horizon.stellar.org
STELLAR_NETWORK_PASSPHRASE=Public Global Stellar Network ; September 2015
CONTRACT_ID=G...YOUR_CONTRACT_ADDRESS...
JWT_SECRET=<secure-random-32+ chars>
JWT_REFRESH_SECRET=<secure-random-32+ chars>
MFA_SECRET=<secure-random-32+ chars>
ADMIN_API_KEY=<strong-random-secret>
NODE_ENV=production
PORT=4000
FRONTEND_URL=https://app.example.com
```

### Elasticsearch and optional backup variables

```env
ELASTICSEARCH_API_KEY=<elastic-cloud-api-key>
BACKUP_DIR=/var/backups/stellar-trust
BACKUP_RETENTION_DAYS=30
BACKUP_S3_BUCKET=s3://my-company-backups/stellar-trust
WAL_ARCHIVE_DIR=/var/lib/postgresql/wal_archive
WAL_ARCHIVE_S3_BUCKET=s3://my-company-backups/stellar-trust/wal
```

## 4. Database migration process

The backend includes a migration runner at `backend/database/migrations/migrate.js`.

### Apply pending migrations

```bash
cd backend
npm run db:migrate:up
```

This will:

- create the `_migration_log` table if needed
- discover migration files in `backend/database/migrations`
- apply pending migrations in timestamp order
- record each migration as applied

### Roll back the last applied migration

```bash
cd backend
npm run db:migrate:down
```

This will:

- find the last applied migration from `_migration_log`
- execute its `down()` rollback function
- mark the migration as rolled back

### Check migration status

```bash
cd backend
npm run db:migrate:status
```

This prints the local migration file state and also invokes `npx prisma migrate status --schema=database/schema.prisma`.

### Create a new migration scaffold

```bash
cd backend
npm run db:migrate:create -- <migration-name>
```

This creates a new migration template file in `backend/database/migrations/`.

### Rollback considerations

- Only the last applied migration is rolled back.
- A rollback requires the migration file to export a `down()` function.
- Use rollback sparingly in production; prefer forward fixes when possible.
- Always back up the database before applying or rolling back migrations.

## 5. Stellar network configuration

The app supports both Stellar testnet and mainnet.

### Switch between testnet and mainnet

Set these variables in the backend environment:

- `STELLAR_NETWORK=testnet` or `mainnet`
- `SOROBAN_RPC_URL` to the network RPC endpoint
- `STELLAR_HORIZON_URL` to the Horizon endpoint
- `STELLAR_NETWORK_PASSPHRASE` to the correct passphrase
- `CONTRACT_ID` to the deployed escrow contract address on that network

### Example endpoints

- Testnet:
  - `SOROBAN_RPC_URL=https://soroban-testnet.stellar.org`
  - `STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org`
  - `STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015`

- Mainnet:
  - `SOROBAN_RPC_URL=https://soroban-mainnet.stellar.org`
  - `STELLAR_HORIZON_URL=https://horizon.stellar.org`
  - `STELLAR_NETWORK_PASSPHRASE=Public Global Stellar Network ; September 2015`

### Frontend network flags

For the frontend, propagate the network settings via public environment variables:

```env
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_STELLAR_NETWORK=mainnet
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-mainnet.stellar.org
NEXT_PUBLIC_CONTRACT_ADDRESS=<contract-id>
```

## 6. TLS termination and reverse proxy setup

The backend and frontend both expose plain HTTP. In production, terminate TLS at a reverse proxy.

### Recommended proxy options

- `nginx`
- `Caddy`
- cloud load balancer

### Nginx example

```nginx
server {
  listen 80;
  server_name api.example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name api.example.com;

  ssl_certificate /etc/ssl/certs/example.crt;
  ssl_certificate_key /etc/ssl/private/example.key;
  ssl_protocols TLSv1.3 TLSv1.2;
  ssl_prefer_server_ciphers on;

  location / {
    proxy_pass http://backend:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-ID $request_id;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
  }
}

server {
  listen 443 ssl http2;
  server_name app.example.com;

  ssl_certificate /etc/ssl/certs/example.crt;
  ssl_certificate_key /etc/ssl/private/example.key;

  location / {
    proxy_pass http://frontend:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

### Caddy example

```caddyfile
api.example.com {
  reverse_proxy backend:4000
}

app.example.com {
  reverse_proxy frontend:3000
}
```

### Proxy and headers

- Ensure the reverse proxy forwards `X-Forwarded-Proto` and `X-Forwarded-For`.
- If you run the backend behind a proxy, only expose the backend port internally.
- Use HTTP Strict Transport Security (HSTS) for public-facing domains.

## 7. Go-live checklist

### Pre-launch

- [ ] Confirm host OS is supported and up to date
- [ ] Confirm Docker and Docker Compose are installed
- [ ] Provision PostgreSQL, Redis, and Elasticsearch
- [ ] Configure production secrets securely
- [ ] Set `NODE_ENV=production`
- [ ] Set `STELLAR_NETWORK=mainnet` and mainnet RPC/Horizon endpoints if launching live
- [ ] Set `CONTRACT_ID` to the deployed mainnet contract
- [ ] Ensure `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `MFA_SECRET` are strong and unique
- [ ] Enable vault-backed secrets if required
- [ ] Validate environment with `node scripts/check-env.js`
- [ ] Confirm TLS certificates are valid and installed
- [ ] Confirm reverse proxy configuration for `api.example.com` and `app.example.com`
- [ ] Confirm backup strategy for Postgres WAL / dumps
- [ ] Confirm logging and monitoring (Sentry, metrics, health checks)

### Startup

- [ ] Start PostgreSQL, Redis, and Elasticsearch services
- [ ] Apply database migrations
- [ ] Start backend service
- [ ] Start frontend service
- [ ] Verify services are reachable on their internal ports
- [ ] Verify the reverse proxy routes traffic correctly

### Post-start

- [ ] Run smoke tests against the public URL
- [ ] Verify `/health` and `/health/ready` endpoints return OK
- [ ] Verify backend logs show successful startup
- [ ] Monitor CPU, memory, disk, and Elasticsearch health
- [ ] Verify that the app can connect to Stellar mainnet and resolve contract calls

## 8. Smoke test steps

### Basic health checks

- `GET https://api.example.com/health`
- `GET https://api.example.com/health/ready`
- `GET https://api.example.com/health/live`

Expect HTTP `200` and JSON responses that indicate availability.

### API test

- `GET https://api.example.com/api/disputes` (authenticated request if required)
- `GET https://api.example.com/api/escrows` or another public endpoint

### Frontend test

- Visit `https://app.example.com`
- Confirm the UI loads and the login / onboarding page is reachable
- Confirm the frontend requests go to `NEXT_PUBLIC_API_URL`

### Stellar connectivity test

- Confirm `SOROBAN_RPC_URL` and `STELLAR_HORIZON_URL` are reachable from the host.
- Confirm the backend can query contract state for `CONTRACT_ID`.

### Database migration verification

- Confirm `_migration_log` exists in PostgreSQL
- Confirm `npm run db:migrate:status` reports no pending migrations
- Confirm the expected schema objects exist

### Optional smoke tests

- Run a cross-service end-to-end workflow against test data in staging
- Create a dummy escrow and verify lifecycle transitions
- Upload evidence to confirm the IPFS/evidence pipeline works if enabled

## 9. Troubleshooting notes

### Common startup issues

- `check-env.js` fails: missing required env vars or insecure defaults
- backend cannot connect to Redis or Postgres: validate `REDIS_URL` and `DATABASE_URL`
- `CONTRACT_ID` missing or invalid: ensure the deployed escrow contract address matches the network
- `SOROBAN_RPC_URL` unreachable: check network access and endpoint availability

### Production best practices

- Never commit `.env` files or secrets into version control.
- Use a secrets manager or Docker secrets for production values.
- Keep backups of critical data and WAL logs before applying migrations.
- Run migrations during a maintenance window if the database is live.
- Monitor Elasticsearch memory and disk usage closely.

## 10. Recommended production architecture

A deployable production architecture should look like this:

- frontend behind TLS reverse proxy
- backend behind TLS reverse proxy
- private PostgreSQL cluster with regular backups
- private Redis cache/queue service
- private Elasticsearch cluster with snapshot backup
- external Soroban RPC endpoint for Stellar mainnet
- optional external IPFS gateway for evidence storage

This structure keeps the app services isolated, reduces attack surface, and ensures that only TLS-terminated traffic reaches public endpoints.
