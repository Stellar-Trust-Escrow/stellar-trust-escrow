# API Reference

REST API documentation for the StellarTrustEscrow backend.

Base URL: `http://localhost:4000` (development)

> **Interactive docs** — A full Swagger UI is available at [`/api/docs`](http://localhost:4000/api/docs) when the server is running.
> The raw OpenAPI 3.0 JSON spec is served at [`/api/docs/json`](http://localhost:4000/api/docs/json).

---

## Authentication

Most sensitive endpoints require a JWT Bearer token.

```
Authorization: Bearer <access_token>
```

Obtain tokens via `POST /api/auth/login`. Access tokens expire in **15 minutes**; use `POST /api/auth/refresh` to renew.

Admin-only endpoints require the `x-admin-api-key` header instead.

Wallet-scoped endpoints additionally enforce that the wallet address in the JWT
matches the `:address` path segment or request body.

---

## Rate Limiting

| Scope                             | Window   | Limit       |
| --------------------------------- | -------- | ----------- |
| All API endpoints                 | 1 minute | 60 requests |
| `GET /api/reputation/leaderboard` | 1 minute | 30 requests |

Exceeding the limit returns `429 Too Many Requests`:

```json
{
  "error": "Too many API requests, please slow down and try again in a minute.",
  "code": "RATE_LIMIT_EXCEEDED"
}
```

---

## Pagination

All collection endpoints return a standard envelope:

```json
{
  "data": [...],
  "page": 1,
  "limit": 20,
  "total": 42,
  "totalPages": 3,
  "hasNextPage": true,
  "hasPreviousPage": false
}
```

Query parameters: `page` (default 1) and `limit` (default 20, max 100).

---

## Error Format

All errors follow this shape:

```json
{
  "error": "Human-readable error message",
  "code": "OPTIONAL_ERROR_CODE"
}
```

---

## Endpoints Overview

| Tag           | Base Path            | Auth Required |
| ------------- | -------------------- | ------------- |
| Auth          | `/api/auth`          | Public except `POST /logout` |
| Escrows       | `/api/escrows`       | Bearer JWT |
| Users         | `/api/users`         | Bearer JWT, with wallet ownership on export/import |
| Reputation    | `/api/reputation`    | Public |
| Disputes      | `/api/disputes`      | Bearer JWT |
| Payments      | `/api/payments`      | Bearer JWT, with wallet/payment ownership; webhook signed |
| KYC           | `/api/kyc`           | Bearer JWT for user endpoints; webhook signed; admin uses API key |
| Events        | `/api/events`        | Public |
| Search        | `/api/search`        | Public, except admin analytics/reindex |
| Notifications | `/api/notifications` | Admin API Key for internal queue/event endpoints; unsubscribe/resubscribe token for user email actions |
| Relayer       | `/api/relayer`       | Bearer JWT for execution and fee estimate |
| Audit         | `/api/audit`         | Admin API Key |
| Admin         | `/api/admin`         | Admin API Key |
| Health        | `/health`            | Public |

For full request/response schemas, parameters, and code samples, see the **[interactive Swagger UI](http://localhost:4000/api/docs)**.

For the full endpoint-by-endpoint audit matrix, see [docs/api-auth-audit.md](/home/json/Desktop/Drips/stellar-trust-escrow/docs/api-auth-audit.md).

---

## Code Samples

### Register and login

```bash
# Register
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"S3cur3P@ss!"}'

# Login
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"S3cur3P@ss!"}'
```

### List escrows

```bash
curl http://localhost:4000/api/escrows \
  -H "Authorization: Bearer <access_token>"
```

```javascript
// JavaScript (fetch)
const res = await fetch('http://localhost:4000/api/escrows', {
  headers: { Authorization: `Bearer ${accessToken}` },
});
const { data, total } = await res.json();
```

```python
# Python (requests)
import requests
resp = requests.get(
    'http://localhost:4000/api/escrows',
    headers={'Authorization': f'Bearer {access_token}'}
)
print(resp.json())
```

### Refresh access token

```bash
curl -X POST http://localhost:4000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refresh_token>"}'
```

### Get reputation leaderboard

```bash
curl "http://localhost:4000/api/reputation/leaderboard?page=1&limit=10"
```
