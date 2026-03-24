# API Reference

REST API documentation for the StellarTrustEscrow backend.

Base URL: `http://localhost:4000` (development)

---

## Rate Limiting

All `/api/*` endpoints are protected by rate limiting middleware.

Default behavior:

| Scope | Window | Limit |
| ----- | ------ | ----- |
| All API endpoints | 1 minute | 60 requests |
| `GET /api/reputation/leaderboard` | 1 minute | 30 requests |

How identities are tracked:

- Authenticated users are limited by `req.user.id`, `req.user.address`, `X-User-Id`, or `X-User-Address` when available.
- Anonymous traffic falls back to IP-based limiting.

Environment variables:

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `RATE_LIMIT_MAX_REQUESTS_PER_MINUTE` | `60` | Global per-user/IP request cap for API routes |
| `LEADERBOARD_RATE_LIMIT_MAX_REQUESTS_PER_MINUTE` | `30` | Stricter cap for leaderboard reads |

When a client exceeds the limit, the API returns `429 Too Many Requests`:

```json
{
  "error": "Too many API requests, please slow down and try again in a minute.",
  "code": "RATE_LIMIT_EXCEEDED"
}
```

---

## Escrows

### `GET /api/escrows`

List all escrows, paginated.

**Query Parameters:**

| Param        | Type   | Default | Description                                    |
| ------------ | ------ | ------- | ---------------------------------------------- |
| `page`       | number | 1       | Page number                                    |
| `limit`      | number | 20      | Items per page (max 100)                       |
| `status`     | string | —       | Filter: Active, Completed, Disputed, Cancelled |
| `client`     | string | —       | Filter by client Stellar address               |
| `freelancer` | string | —       | Filter by freelancer address                   |

**Response:**

```json
{
  "data": [
    {
      "id": 1,
      "clientAddress": "GABC...",
      "freelancerAddress": "GXYZ...",
      "totalAmount": "2000000000",
      "remainingBalance": "1500000000",
      "status": "Active",
      "milestoneCount": 3,
      "approvedMilestones": 1,
      "createdAt": "2025-03-01T00:00:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

---

### `GET /api/escrows/:id`

Get full escrow details including milestones.

**Response:**

```json
{
  "id": 1,
  "clientAddress": "GABC...",
  "freelancerAddress": "GXYZ...",
  "arbiterAddress": null,
  "tokenAddress": "USDC_CONTRACT",
  "totalAmount": "2000000000",
  "remainingBalance": "1500000000",
  "status": "Active",
  "briefHash": "QmIPFSHash...",
  "deadline": null,
  "createdAt": "2025-03-01T00:00:00Z",
  "milestones": [
    {
      "id": 0,
      "title": "Initial Designs",
      "amount": "500000000",
      "status": "Approved",
      "submittedAt": "2025-03-05T00:00:00Z",
      "resolvedAt": "2025-03-06T00:00:00Z"
    }
  ]
}
```

---

### `POST /api/escrows/broadcast`

Broadcast a pre-signed Stellar transaction.

**Request Body:**

```json
{
  "signedXdr": "AAAAAgAAAA..."
}
```

**Response:**

```json
{
  "success": true,
  "hash": "abc123..."
}
```

---

## Users

### `GET /api/users/:address`

Get user profile combining reputation + recent escrows.

### `GET /api/users/:address/escrows`

| Param    | Type   | Description                      |
| -------- | ------ | -------------------------------- |
| `role`   | string | `client`, `freelancer`, or `all` |
| `status` | string | EscrowStatus filter              |

### `GET /api/users/:address/stats`

Returns: `total_volume`, `completion_rate`, `avg_milestone_approval_time_hours`

---

## Reputation

### `GET /api/reputation/:address`

Returns the full on-chain reputation record.

### `GET /api/reputation/leaderboard`

Returns top users by score. Query params: `limit`, `page`.

---

## Disputes

### `GET /api/disputes`

List all escrows in Disputed status.

### `GET /api/disputes/:escrowId`

Get dispute details for a specific escrow.

---

## Error Format

All errors follow this shape:

```json
{
  "error": "Human-readable error message",
  "code": "ESCROW_NOT_FOUND"
}
```

TODO (contributor — Issue #18): implement structured error codes matching the contract's `EscrowError` enum.
