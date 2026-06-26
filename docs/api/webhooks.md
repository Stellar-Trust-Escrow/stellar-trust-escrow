# Webhooks API

Base path: `/api/webhooks`. The gateway requires JWT for every route; API keys are not substitutes. CSRF is skipped for webhook paths. Subscriptions are scoped by JWT `address`.

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/webhooks/subscribe` | Create subscription |
| GET | `/api/webhooks` | List subscriptions |
| POST | `/api/webhooks/:id/rotate-secret` | Rotate a subscription secret |
| DELETE | `/api/webhooks/:id` | Delete subscription |
| GET | `/api/webhooks/:id/deliveries` | Delivery history |

## POST `/api/webhooks/subscribe`

Body: `url` (required HTTPS URL), `eventTypes` (required non-empty string array, max 20). Limited to 10 requests per 10 minutes per address.

```bash
curl -X POST http://localhost:3001/api/webhooks/subscribe -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"url":"https://integrations.acme.test/stellar/webhooks","eventTypes":["esc_crt","mil_apr","funds_rel"]}'
```

```json
{"data":{"id":"cmc9x7h3q0001w9j1a2b3c4d5","url":"https://integrations.acme.test/stellar/webhooks","eventTypes":["esc_crt","mil_apr","funds_rel"],"createdAt":"2026-06-25T11:18:42.000Z","updatedAt":"2026-06-25T11:18:42.000Z","secret":"d30fb4cd94173a09c0aefcc9ae473f0a6fd1713a3c6eecb9e40a708b520770a1"}}
```

| Status | Response |
| --- | --- |
| 201 | Subscription and one-time secret above |
| 400 | `{"error":"url must be a valid HTTPS URL"}` |
| 400 | `{"error":"eventTypes must be a non-empty array"}` |
| 400 | `{"error":"eventTypes may not exceed 20 entries"}` |
| 429 | `{"error":"Too many webhook subscription requests — try again later","code":"RATE_LIMIT_EXCEEDED"}` |
| 401/403/404/429/500 | [Shared responses](./README.md#shared-responses) |

## GET `/api/webhooks`

```bash
curl http://localhost:3001/api/webhooks -H "Authorization: Bearer $TOKEN"
```

```json
{"data":[{"id":"cmc9x7h3q0001w9j1a2b3c4d5","url":"https://integrations.acme.test/stellar/webhooks","eventTypes":["esc_crt","mil_apr","funds_rel"],"isActive":true,"createdAt":"2026-06-25T11:18:42.000Z","updatedAt":"2026-06-25T11:18:42.000Z"}]}
```

| Status | Response |
| --- | --- |
| 200 | `{data: subscriptions}`; secrets omitted |
| 401/403/404/429/500 | Shared responses |

## POST `/api/webhooks/:id/rotate-secret`

Rotate the signing secret for a webhook subscription. The previous secret stops working immediately after the rotation.

```bash
curl -X POST http://localhost:3001/api/webhooks/cmc9x7h3q0001w9j1a2b3c4d5/rotate-secret -H "Authorization: Bearer $TOKEN"
```

```json
{"data":{"id":"cmc9x7h3q0001w9j1a2b3c4d5","secret":"4a1e0d54d7e0bf6cc93cb0f0d6c91f6d1f0d9690c4a7d7f91d2f7a8a3d0cd0af"}}
```

| Status | Response |
| --- | --- |
| 200 | `{data: { id, secret }}` |
| 404 | `{"error":"Webhook subscription not found"}` |
| 401/403/429/500 | Shared responses |

## DELETE `/api/webhooks/:id`

```bash
curl -X DELETE http://localhost:3001/api/webhooks/cmc9x7h3q0001w9j1a2b3c4d5 -H "Authorization: Bearer $TOKEN"
```

| Status | Response |
| --- | --- |
| 204 | Empty body |
| 404 | `{"error":"Webhook subscription not found"}`; also used for another owner's subscription |
| 401/403/429/500 | Shared responses |

## GET `/api/webhooks/:id/deliveries`

Query: `page` (default 1, not validated), `limit` (default 30, maximum 100, no lower-bound validation).

```bash
curl 'http://localhost:3001/api/webhooks/cmc9x7h3q0001w9j1a2b3c4d5/deliveries?page=1&limit=30' -H "Authorization: Bearer $TOKEN"
```

```json
{"page":1,"limit":30,"total":2,"deliveries":[{"id":"cmc9yb6pk0002w9j1e6f7g8h9","eventType":"funds_rel","status":"success","attempts":1,"responseCode":200,"errorMessage":null,"lastAttemptAt":"2026-06-25T11:25:03.000Z","createdAt":"2026-06-25T11:25:02.000Z"},{"id":"cmc9y4x9c0001w9j1i0j1k2l3","eventType":"mil_apr","status":"failed","attempts":5,"responseCode":503,"errorMessage":"Webhook returned HTTP 503","lastAttemptAt":"2026-06-25T11:23:44.000Z","createdAt":"2026-06-25T11:20:00.000Z"}]}
```

Unknown/differently owned subscriptions return `200` with an empty list.

| Status | Response |
| --- | --- |
| 200 | `{page,limit,total,deliveries}` |
| 500 | `{"error":"<database or invalid pagination message>"}` |
| 401/403/404/429 | Shared responses |

## Delivered request

Headers: `X-Webhook-Signature`, `X-Webhook-Timestamp`, `X-Webhook-Delivery-Id`, and `X-Webhook-Event-Type`. Signature is the `sha256=` prefixed HMAC-SHA256 of `timestamp + rawBody` using the subscription secret.

```json
{"eventType":"funds_rel","deliveryId":"cmc9yb6pk0002w9j1e6f7g8h9","timestamp":"2026-06-25T11:25:02.000Z","data":{"escrowId":"1042","amount":"750000000","recipient":"GDQP2WX3YJQZC6KLE5Q7PH7L4QK6RFKX2HM5FMVNNK7KXQMS3RYM4B7A"}}
```
