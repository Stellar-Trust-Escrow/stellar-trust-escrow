# REST API reference

This reference documents routes registered from `backend/api/routes/`. The repository has no `backend/src/routes/` directory. Local base URL: `http://localhost:3001/api`.

`backend/server.js` mounts unversioned `/api/*` routes. `backend/api/v1/index.js` exists but is not mounted.

## Resource groups

| Resource | Reference | Endpoints |
| --- | --- | ---: |
| Escrows | [Escrows](./escrows.md) | 5 |
| Disputes | [Disputes](./disputes.md) | 9 |
| Users | [Users](./users.md) | 6 |
| Webhooks | [Webhooks](./webhooks.md) | 4 |

## Authentication

All routes in these groups require `Authorization: Bearer <JWT>`.

### Obtain a JWT

Request a five-minute wallet challenge:

```bash
curl -X POST http://localhost:3001/api/auth/nonce \
  -H 'Content-Type: application/json' \
  -d '{"address":"GBZXN7PIRZGNMHGA4YFQQI6K7JMVKQ2DMQF3KWPZSSIJ7H5V7XKQXLMR"}'
```

```json
{"address":"GBZXN7PIRZGNMHGA4YFQQI6K7JMVKQ2DMQF3KWPZSSIJ7H5V7XKQXLMR","nonce":"c696f75f0f568f78c2fe54ebce36a5102e15847af8312446bccf12e2329776c9","message":"Sign this message to authenticate with StellarTrustEscrow.\n\nAddress: GBZX...XLMR\nNonce: c696...76c9\nTimestamp: 1782385200000","expiresIn":300}
```

Sign the exact `message` with the Stellar key, Base64-encode the signature, then verify:

```bash
curl -X POST http://localhost:3001/api/auth/verify \
  -H 'Content-Type: application/json' \
  -d '{"address":"GBZXN7PIRZGNMHGA4YFQQI6K7JMVKQ2DMQF3KWPZSSIJ7H5V7XKQXLMR","signature":"MEUCIQDYh9dJf6m2jK4m9W8hX9JtY7fZ2gq8fNf3u6cQmAIgP4..."}'
```

```json
{"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...","address":"GBZXN7PIRZGNMHGA4YFQQI6K7JMVKQ2DMQF3KWPZSSIJ7H5V7XKQXLMR","expiresIn":"24h"}
```

Implementation note: the gateway public allowlist names `/auth/login` and `/auth/register`, not the implemented `/auth/nonce` and `/auth/verify`. In the assembled server these challenge routes currently require a bearer token. This is a server defect.

### API keys

Administrative routes use `x-admin-api-key: <ADMIN_API_KEY>`. An operator provisions it through the server's `ADMIN_API_KEY` environment variable; no REST endpoint issues it. None of these four resource groups accepts an API key instead of a JWT.

### CSRF for writes

Outside `NODE_ENV=test`, non-webhook writes require a matching `csrf_token` cookie and `X-CSRF-Token` header. Obtain both with `curl -c cookies.txt http://localhost:3001/api/csrf-token`. Webhook paths skip CSRF protection.

## Tenant selection

Use `X-Tenant-Id` or `X-Tenant-Slug`; otherwise the default tenant is used.

## Shared responses

Every endpoint can return these before its controller runs:

| Status | Example body |
| --- | --- |
| `401` | `{"error":"Authentication required"}` |
| `401` | `{"error":"Token expired"}` |
| `401` | `{"error":"Invalid token"}` |
| `401` | `{"error":"Session revoked or expired. Please log in again."}` |
| `403` | `{"error":"Tenant is not active"}` |
| `403` | `{"error":"Invalid or missing CSRF token"}` |
| `404` | `{"error":"Tenant not found"}` |
| `429` | `{"error":"Too many requests, please try again later.","code":"RATE_LIMIT_EXCEEDED"}` |
| `500` | `{"error":"<message>"}`; may include `errorId` |

Rate-limit responses include `Retry-After` and `X-RateLimit-*` headers. Treat on-chain IDs and amounts as decimal strings; dates are ISO 8601 UTC strings. Standard pagination is `{data,page,limit,total,totalPages,hasNextPage,hasPreviousPage}`.
