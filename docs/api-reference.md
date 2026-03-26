# API Reference

REST API documentation for the StellarTrustEscrow backend.

Base URL: `http://localhost:4000` (development)

> **Interactive docs** — A full Swagger UI is available at [`/api/docs`](http://localhost:4000/api/docs) when the server is running.
> The raw OpenAPI 3.0 JSON spec is served at [`/api/docs/json`](http://localhost:4000/api/docs/json).

---

## Authentication

Most endpoints require a JWT Bearer token.

```
Authorization: Bearer <access_token>
```

Obtain tokens via `POST /api/auth/login`. Access tokens expire in **15 minutes**; use `POST /api/auth/refresh` to renew.

Admin-only endpoints require the `x-admin-api-key` header instead.

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

| Tag           | Base Path            | Auth Required     |
| ------------- | -------------------- | ----------------- |
| Auth          | `/api/auth`          | No                |
| Escrows       | `/api/escrows`       | Bearer JWT        |
| Users         | `/api/users`         | Bearer JWT        |
| Reputation    | `/api/reputation`    | No                |
| Disputes      | `/api/disputes`      | No                |
| Payments      | `/api/payments`      | No (KYC required) |
| KYC           | `/api/kyc`           | No                |
| Events        | `/api/events`        | No                |
| Search        | `/api/search`        | No                |
| Notifications | `/api/notifications` | No                |
| Relayer       | `/api/relayer`       | No                |
| Audit         | `/api/audit`         | Admin API Key     |
| Admin         | `/api/admin`         | Admin API Key     |
| Health        | `/health`            | No                |

For full request/response schemas, parameters, and code samples, see the **[interactive Swagger UI](http://localhost:4000/api/docs)**.

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
