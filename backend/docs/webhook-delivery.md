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

Requests are signed with HMAC-SHA256 using the subscription secret. The signature is sent in the `X-Webhook-Signature` header.

Verify by computing:

```js
const signature = crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
```

Then compare it to the received header.

### Additional headers

- `X-Webhook-Signature`: HMAC-SHA256 signature of the request body.
- `X-Webhook-Delivery-Id`: unique delivery identifier.
- `X-Webhook-Event-Type`: event type that triggered the delivery.

## Retry behavior

Webhook deliveries are retried automatically with exponential backoff. The worker will retry failed deliveries up to 5 times before marking the delivery as permanently `failed`.

## Delivery and subscription history

- `GET /api/webhooks` — list webhook subscriptions for the authenticated account.
- `DELETE /api/webhooks/:id` — remove a subscription.
- `GET /api/webhooks/:id/deliveries` — view delivery history, including attempts, response codes, and errors.
