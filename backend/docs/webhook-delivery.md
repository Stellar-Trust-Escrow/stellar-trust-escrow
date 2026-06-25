# Webhook Delivery Guide

Stellar Trust Escrow supports webhook subscriptions for indexed on-chain events. Webhooks are delivered as signed HTTP `POST` requests with retry semantics to help third-party integrations react instantly.

## Subscribe to events

Use the `/api/webhooks/subscribe` endpoint with an authenticated bearer token.

Request body:

```json
{
  "url": "https://example.com/webhooks",
  "eventTypes": ["esc_crt", "mil_apr", "funds_rel"]
}
```

Response includes a secret for verifying payloads:

```json
{
  "data": {
    "id": "ckxyz...",
    "url": "https://example.com/webhooks",
    "eventTypes": ["esc_crt"],
    "secret": "...",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

> Store this secret securely. It is only returned once at subscription creation.

## Delivery payload

Each webhook request contains a JSON body with the following structure:

```json
{
  "eventType": "esc_crt",
  "deliveryId": "ckxyz...",
  "timestamp": "2026-05-28T12:34:56.789Z",
  "data": {
    "ledger": "123456",
    "ledgerAt": "2026-05-28T12:34:56.789Z",
    "contractId": "...",
    "escrowId": "42",
    "topics": [...],
    "data": {...},
    "txHash": "..."
  }
}
```

## Signature verification

Requests are signed with HMAC-SHA256 using the subscription secret. The signature is sent in the `X-Webhook-Signature` header with the `sha256=` prefix and is computed over `timestamp + rawBody`. Consumers should reject deliveries whose `X-Webhook-Timestamp` is more than 5 minutes old.

Verify by computing:

```js
const signature = `sha256=${crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;
```

Then compare it to the received header using a constant-time comparison.

### Additional headers

- `X-Webhook-Signature`: `sha256=` prefixed HMAC-SHA256 signature of `timestamp + rawBody`.
- `X-Webhook-Timestamp`: timestamp used in the signature input.
- `X-Webhook-Delivery-Id`: unique delivery identifier.
- `X-Webhook-Event-Type`: event type that triggered the delivery.

### Python example

```python
import hashlib
import hmac


def verify_webhook(raw_body: bytes, received_signature: str, timestamp: str, secret: str) -> bool:
    expected = hmac.new(secret.encode('utf-8'), f"{timestamp}.{raw_body.decode('utf-8')}".encode('utf-8'), hashlib.sha256).hexdigest()
    provided = received_signature.removeprefix("sha256=")
    return hmac.compare_digest(expected, provided)
```

## Retry behavior

Webhook deliveries are retried automatically with exponential backoff. The worker will retry failed deliveries up to 5 times before marking the delivery as permanently `failed`.

## Delivery and subscription history

- `GET /api/webhooks` — list webhook subscriptions for the authenticated account.
- `POST /api/webhooks/:id/rotate-secret` — rotate the signing secret for a subscription.
- `DELETE /api/webhooks/:id` — remove a subscription.
- `GET /api/webhooks/:id/deliveries` — view delivery history, including attempts, response codes, and errors.
