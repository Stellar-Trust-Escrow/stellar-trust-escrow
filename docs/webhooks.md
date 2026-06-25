# Webhook Reference

Webhooks let your server receive real-time notifications whenever a Soroban contract event is indexed. The platform POSTs a signed JSON payload to the HTTPS endpoint you register, and retries automatically on failure.

---

## Table of Contents

1. [Subscribing](#subscribing)
2. [Event Types and Payloads](#event-types-and-payloads)
3. [Envelope Structure](#envelope-structure)
4. [Signature Verification](#signature-verification)
5. [Retry Behaviour](#retry-behaviour)
6. [Delivery Log Format](#delivery-log-format)
7. [Managing Subscriptions](#managing-subscriptions)

---

## Subscribing

```
POST /api/webhooks/subscribe
Authorization: Bearer <token>
Content-Type: application/json
```

Request body:

```json
{
  "url": "https://your-server.example.com/hooks",
  "eventTypes": ["esc_crt", "mil_apr", "funds_rel"]
}
```

| Field        | Type             | Required | Notes                                                      |
|--------------|------------------|----------|------------------------------------------------------------|
| `url`        | string           | yes      | Must be `https://`. Private-IP and plain HTTP are rejected. |
| `eventTypes` | array of strings | yes      | 1–20 event type codes. See the table below for valid values. |

Successful response (`201 Created`):

```json
{
  "data": {
    "id": "clx1abc000000xyz",
    "url": "https://your-server.example.com/hooks",
    "eventTypes": ["esc_crt", "mil_apr", "funds_rel"],
    "secret": "a3f9...64c2",
    "createdAt": "2026-06-25T12:00:00.000Z",
    "updatedAt": "2026-06-25T12:00:00.000Z"
  }
}
```

> **Save the `secret` immediately.** It is only returned once and is required to verify signatures on every delivery.

The subscribe endpoint is rate-limited to **10 requests per 10-minute window** per authenticated address.

---

## Event Types and Payloads

Every event shares a common [envelope](#envelope-structure). The tables below describe what triggers each event and the shape of the `data` field inside that envelope.

### `esc_crt` — Escrow Created

Emitted when a new escrow is funded and created on-chain.

```json
{
  "eventType": "esc_crt",
  "ledger": "12345678",
  "ledgerAt": "2026-06-25T12:00:00.000Z",
  "contractId": "CBTC...XYZ",
  "escrowId": "42",
  "txHash": "a1b2c3...",
  "eventIndex": 0,
  "topics": ["esc_crt", "42"],
  "data": ["GCLIENT...ADDRESS", "GFREELANCER...ADDRESS", "5000000000"]
}
```

| Field        | Type   | Description                                               |
|--------------|--------|-----------------------------------------------------------|
| `escrowId`   | string | Numeric escrow identifier as a string                     |
| `data[0]`    | string | Client Stellar address                                    |
| `data[1]`    | string | Freelancer Stellar address                                |
| `data[2]`    | string | Total locked amount in stroops (1 XLM = 10,000,000)       |

---

### `mil_add` — Milestone Added

Emitted when a new milestone is added to an existing escrow.

```json
{
  "eventType": "mil_add",
  "escrowId": "42",
  "data": ["1", "1000000000"]
}
```

| Field     | Type   | Description                     |
|-----------|--------|---------------------------------|
| `data[0]` | string | Milestone index (zero-based)    |
| `data[1]` | string | Milestone amount in stroops     |

---

### `mil_sub` — Milestone Submitted

Emitted when the freelancer submits a milestone deliverable.

```json
{
  "eventType": "mil_sub",
  "escrowId": "42",
  "data": ["1", "GFREELANCER...ADDRESS"]
}
```

| Field     | Type   | Description                        |
|-----------|--------|------------------------------------|
| `data[0]` | string | Milestone index                    |
| `data[1]` | string | Freelancer address who submitted   |

---

### `mil_apr` — Milestone Approved

Emitted when the client approves a submitted milestone. Funds for that milestone are released to the freelancer.

```json
{
  "eventType": "mil_apr",
  "escrowId": "42",
  "data": ["1", "1000000000"]
}
```

| Field     | Type   | Description                      |
|-----------|--------|----------------------------------|
| `data[0]` | string | Milestone index                  |
| `data[1]` | string | Amount released in stroops       |

---

### `mil_rej` — Milestone Rejected

Emitted when the client rejects a submitted milestone.

```json
{
  "eventType": "mil_rej",
  "escrowId": "42",
  "data": ["1", "GCLIENT...ADDRESS"]
}
```

| Field     | Type   | Description                     |
|-----------|--------|---------------------------------|
| `data[0]` | string | Milestone index                 |
| `data[1]` | string | Client address who rejected     |

---

### `mil_dis` — Milestone Disputed

Emitted when a dispute is raised against a specific milestone.

```json
{
  "eventType": "mil_dis",
  "escrowId": "42",
  "data": ["1", "GCLIENT...ADDRESS"]
}
```

| Field     | Type   | Description                        |
|-----------|--------|------------------------------------|
| `data[0]` | string | Milestone index                    |
| `data[1]` | string | Address that raised the dispute    |

---

### `funds_rel` — Funds Released

Emitted when funds are released from the escrow contract to the freelancer.

```json
{
  "eventType": "funds_rel",
  "escrowId": "42",
  "data": ["GFREELANCER...ADDRESS", "1000000000"]
}
```

| Field     | Type   | Description                          |
|-----------|--------|--------------------------------------|
| `data[0]` | string | Recipient address (freelancer)       |
| `data[1]` | string | Amount released in stroops           |

---

### `esc_can` — Escrow Cancelled

Emitted when both parties mutually cancel an escrow and funds are returned to the client.

```json
{
  "eventType": "esc_can",
  "escrowId": "42",
  "data": "5000000000"
}
```

| Field  | Type   | Description                               |
|--------|--------|-------------------------------------------|
| `data` | string | Amount returned to the client in stroops  |

---

### `dis_rai` — Dispute Raised

Emitted when either party escalates an escrow to disputed status.

```json
{
  "eventType": "dis_rai",
  "escrowId": "42",
  "data": "GCLIENT...ADDRESS"
}
```

| Field  | Type   | Description                            |
|--------|--------|----------------------------------------|
| `data` | string | Stellar address that raised the dispute |

---

### `dis_res` — Dispute Resolved

Emitted when an arbiter resolves a dispute and splits the remaining funds.

```json
{
  "eventType": "dis_res",
  "escrowId": "42",
  "data": ["2500000000", "2500000000"]
}
```

| Field     | Type   | Description                               |
|-----------|--------|-------------------------------------------|
| `data[0]` | string | Amount awarded to the client in stroops   |
| `data[1]` | string | Amount awarded to the freelancer in stroops |

---

### `rep_upd` — Reputation Updated

Emitted when a reputation score is updated on-chain (after escrow completion or dispute resolution). This event has no `escrowId`.

```json
{
  "eventType": "rep_upd",
  "escrowId": null,
  "data": ["GADDRESS...XYZ", "1250"]
}
```

| Field     | Type   | Description                              |
|-----------|--------|------------------------------------------|
| `data[0]` | string | Stellar address whose score was updated  |
| `data[1]` | string | New aggregate reputation score          |

---

## Envelope Structure

Every delivery wraps the event-specific fields in a common envelope:

```json
{
  "eventType": "mil_apr",
  "deliveryId": "clx2def000001abc",
  "timestamp": "2026-06-25T12:05:30.123Z",
  "data": {
    "eventType": "mil_apr",
    "ledger": "12345679",
    "ledgerAt": "2026-06-25T12:05:28.000Z",
    "contractId": "CBTC...XYZ",
    "escrowId": "42",
    "txHash": "d4e5f6...",
    "eventIndex": 1,
    "topics": ["mil_apr", "42"],
    "data": ["1", "1000000000"]
  }
}
```

| Field        | Type   | Description                                                        |
|--------------|--------|--------------------------------------------------------------------|
| `eventType`  | string | The event type code, duplicated at the top level for quick routing |
| `deliveryId` | string | Unique delivery ID; use this for idempotency on your receiver      |
| `timestamp`  | string | ISO 8601 UTC timestamp at the moment of delivery creation          |
| `data`       | object | The full indexed event payload (fields documented per event above) |

Common fields inside `data`:

| Field         | Type        | Description                                            |
|---------------|-------------|--------------------------------------------------------|
| `ledger`      | string      | Stellar ledger sequence number                         |
| `ledgerAt`    | string      | ISO 8601 UTC close time of the ledger                  |
| `contractId`  | string      | Soroban contract address                               |
| `escrowId`    | string\|null | Numeric escrow ID as a string; `null` for `rep_upd`   |
| `txHash`      | string      | Transaction hash on the Stellar network                |
| `eventIndex`  | integer     | Position of this event within the transaction          |
| `topics`      | array       | Raw Soroban event topics                               |
| `data`        | any         | Raw Soroban event data (structure varies per event)    |

---

## Signature Verification

Every delivery is signed with HMAC-SHA256 using the subscription `secret` issued at creation time. The signature covers the **entire serialised JSON body** of the request.

### Headers sent with every delivery

| Header                    | Description                                               |
|---------------------------|-----------------------------------------------------------|
| `X-Webhook-Signature`     | Hex-encoded HMAC-SHA256 signature of the request body     |
| `X-Webhook-Delivery-Id`   | Unique delivery ID (matches `deliveryId` in the payload)  |
| `X-Webhook-Event-Type`    | Event type code that triggered this delivery              |
| `Content-Type`            | Always `application/json`                                 |

### How the signature is computed

```js
const signature = crypto
  .createHmac('sha256', secret)
  .update(JSON.stringify(body))
  .digest('hex');
```

The signing input is `JSON.stringify(body)` where `body` is the full parsed JSON object received — the same object you would get by calling `JSON.parse(rawRequestBody)`.

### Verification example (Node.js)

```js
import crypto from 'crypto';

function verifyWebhook(rawBody, receivedSignature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody) // use the raw bytes, not re-serialised JSON
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(receivedSignature, 'hex'),
  );
}

// Express example
app.post('/hooks', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['x-webhook-signature'];
  if (!verifyWebhook(req.body, sig, process.env.WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }
  const event = JSON.parse(req.body);
  // process event...
  res.status(200).send('ok');
});
```

> **Important:** compare using a constant-time function (`crypto.timingSafeEqual`) to prevent timing attacks. Never use `===` for signature comparison.

---

## Retry Behaviour

When your endpoint returns a non-2xx response or the connection times out, the delivery is retried automatically using **exponential backoff**.

| Attempt | Delay before retry |
|---------|--------------------|
| 1 (initial) | — |
| 2 | ~5 s |
| 3 | ~10 s |
| 4 | ~20 s |
| 5 | ~40 s |
| 6 (final) | no retry — marked `failed` |

Exact delays follow the formula `5000 × 2^(attempt − 1)` milliseconds, subject to BullMQ jitter. Both the base delay and attempt count are configurable via environment variables:

| Variable                     | Default | Effect                                       |
|------------------------------|---------|----------------------------------------------|
| `WEBHOOK_MAX_RETRY_ATTEMPTS` | `5`     | Total delivery attempts (including first)    |
| `WEBHOOK_BACKOFF_BASE_MS`    | `5000`  | Base delay in milliseconds                   |
| `WEBHOOK_KEEP_FAILED_JOBS`   | `100`   | Number of failed jobs retained for debugging |

A delivery is considered **successful** when your endpoint returns any 2xx status code. Any other response (4xx, 5xx, timeout, network error) counts as a failure and triggers a retry.

After all attempts are exhausted the delivery record is set to `failed` and no further retries occur. You can inspect failed deliveries via the delivery history endpoint.

**Idempotency:** Each delivery attempt carries the same `deliveryId`. Use it to deduplicate on your receiver in case a delivery succeeds on the server side but the response is lost in transit.

---

## Delivery Log Format

`GET /api/webhooks/:subscriptionId/deliveries` returns a paginated list of delivery records:

```json
{
  "page": 1,
  "limit": 30,
  "total": 142,
  "deliveries": [
    {
      "id": "clx2def000001abc",
      "eventType": "mil_apr",
      "status": "success",
      "attempts": 1,
      "responseCode": 200,
      "errorMessage": null,
      "lastAttemptAt": "2026-06-25T12:05:31.000Z",
      "createdAt": "2026-06-25T12:05:30.000Z"
    },
    {
      "id": "clx2ghi000002def",
      "eventType": "esc_crt",
      "status": "failed",
      "attempts": 5,
      "responseCode": 503,
      "errorMessage": "Webhook failed: 503 Service Unavailable",
      "lastAttemptAt": "2026-06-25T13:12:44.000Z",
      "createdAt": "2026-06-25T13:11:00.000Z"
    }
  ]
}
```

### Delivery record fields

| Field           | Type        | Description                                                      |
|-----------------|-------------|------------------------------------------------------------------|
| `id`            | string      | Delivery ID — matches `X-Webhook-Delivery-Id` and `deliveryId`   |
| `eventType`     | string      | Event type code                                                  |
| `status`        | string      | `pending`, `success`, or `failed`                                |
| `attempts`      | integer     | Number of delivery attempts made so far                          |
| `responseCode`  | integer\|null | HTTP status code returned by your endpoint on the last attempt |
| `errorMessage`  | string\|null | Error message on failure; `null` on success                    |
| `lastAttemptAt` | string      | ISO 8601 UTC timestamp of the most recent attempt               |
| `createdAt`     | string      | ISO 8601 UTC timestamp when the delivery was first queued        |

Pagination accepts `?page=<n>&limit=<n>` (max `limit` is 100, default 30).

---

## Managing Subscriptions

| Operation              | Endpoint                             | Notes                                        |
|------------------------|--------------------------------------|----------------------------------------------|
| Subscribe              | `POST /api/webhooks/subscribe`       | Returns secret once; rate-limited to 10/10 min |
| List subscriptions     | `GET /api/webhooks`                  | Returns subscriptions owned by the caller    |
| Delete subscription    | `DELETE /api/webhooks/:id`           | Stops future deliveries immediately          |
| View delivery history  | `GET /api/webhooks/:id/deliveries`   | Paginated; shows all attempts and outcomes   |

All endpoints require a `Bearer` token in the `Authorization` header.
