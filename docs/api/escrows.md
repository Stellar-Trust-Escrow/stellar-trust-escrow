# Escrows API

Base path: `/api/escrows`. All endpoints require a JWT; shared auth, tenant, CSRF, rate-limit, and `500` responses are in [the API index](./README.md#shared-responses).

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/escrows` | List/filter escrows |
| POST | `/api/escrows/broadcast` | Submit signed XDR (not implemented) |
| GET | `/api/escrows/:id/milestones` | List milestones |
| GET | `/api/escrows/:id/milestones/:milestoneId` | Get milestone by index |
| GET | `/api/escrows/:id` | Get escrow details |

## GET `/api/escrows`

Query: `page` (>=1, default 1), `limit` (1-100, default 20), `status` (comma-separated `Active|Completed|Disputed|Cancelled`), `client`, `freelancer`, `search` (ID/address), `minAmount`, `maxAmount`, `dateFrom`, `dateTo`, `sortBy` (`createdAt|totalAmount|status`), `sortOrder` (`asc|desc`). Invalid sort values fall back to defaults.

```bash
curl 'http://localhost:3001/api/escrows?status=Active,Disputed&page=1&limit=20' -H "Authorization: Bearer $TOKEN"
```

```json
{"data":[{"id":"1042","clientAddress":"GBZXN7PIRZGNMHGA4YFQQI6K7JMVKQ2DMQF3KWPZSSIJ7H5V7XKQXLMR","freelancerAddress":"GDQP2WX3YJQZC6KLE5Q7PH7L4QK6RFKX2HM5FMVNNK7KXQMS3RYM4B7A","status":"Active","totalAmount":"2500000000","remainingBalance":"1750000000","deadline":"2026-08-15T18:00:00.000Z","createdAt":"2026-06-18T09:42:11.000Z"}],"page":1,"limit":20,"total":1,"totalPages":1,"hasNextPage":false,"hasPreviousPage":false}
```

| Status | Response |
| --- | --- |
| 200 | Paginated summaries above |
| 400 | `{"errors":[{"msg":"Invalid value","path":"page","location":"query"}]}` |
| 400 | `{"error":"Invalid status value(s)","invalid":["Pending"],"allowed":["Active","Completed","Disputed","Cancelled"]}` |
| 401/403/404/429/500 | Shared responses |

## POST `/api/escrows/broadcast`

JSON body: `signedXdr` (required non-empty string, max 100,000 characters).

```bash
curl -X POST http://localhost:3001/api/escrows/broadcast -H "Authorization: Bearer $TOKEN" -H "X-CSRF-Token: $CSRF_TOKEN" -H 'Content-Type: application/json' -b "csrf_token=$CSRF_TOKEN" -d '{"signedXdr":"AAAAAgAAAAB7K7gV..."}'
```

```json
{"error":"Not implemented - see Issue #20"}
```

| Status | Response |
| --- | --- |
| 400 | Validator `errors[]`, or `{"error":"signedXdr is required"}` |
| 501 | Response above; no success shape is currently implemented |
| 401/403/404/429/500 | Shared responses |

## GET `/api/escrows/:id/milestones`

`id` must contain digits. Query: `page`, `limit` as above.

```bash
curl 'http://localhost:3001/api/escrows/1042/milestones?page=1&limit=20' -H "Authorization: Bearer $TOKEN"
```

```json
{"data":[{"id":311,"milestoneIndex":0,"title":"Design system and landing page","amount":"750000000","status":"Approved","submittedAt":"2026-06-20T12:30:00.000Z","resolvedAt":"2026-06-21T08:10:00.000Z"}],"page":1,"limit":20,"total":3,"totalPages":1,"hasNextPage":false,"hasPreviousPage":false}
```

| Status | Response |
| --- | --- |
| 200 | Paginated milestones; unknown escrow currently returns an empty list |
| 400 | Validator `errors[]`, or `{"error":"Invalid escrow id"}` |
| 401/403/404/429/500 | Shared responses |

## GET `/api/escrows/:id/milestones/:milestoneId`

`milestoneId` is the zero-based milestone index and has no validator.

```bash
curl http://localhost:3001/api/escrows/1042/milestones/0 -H "Authorization: Bearer $TOKEN"
```

```json
{"id":311,"milestoneIndex":0,"escrowId":"1042","title":"Design system and landing page","amount":"750000000","status":"Approved","submittedAt":"2026-06-20T12:30:00.000Z","resolvedAt":"2026-06-21T08:10:00.000Z"}
```

| Status | Response |
| --- | --- |
| 200 | Milestone above |
| 400 | Invalid escrow-ID validator response |
| 404 | `{"error":"Milestone not found"}` |
| 500 | `{"error":"<invalid milestone index or server message>"}` |
| 401/403/429 | Shared responses |

## GET `/api/escrows/:id`

```bash
curl http://localhost:3001/api/escrows/1042 -H "Authorization: Bearer $TOKEN"
```

```json
{"id":"1042","tenantId":"clx4tenant0001","clientAddress":"GBZXN7PIRZGNMHGA4YFQQI6K7JMVKQ2DMQF3KWPZSSIJ7H5V7XKQXLMR","freelancerAddress":"GDQP2WX3YJQZC6KLE5Q7PH7L4QK6RFKX2HM5FMVNNK7KXQMS3RYM4B7A","arbiterAddress":null,"tokenAddress":"CCW67TSZIT3Y4Y2Q2L3Y57U5YZ64KDXT7YAZB6ON5AC5B4BQBQKGI2FZ","totalAmount":"2500000000","remainingBalance":"1750000000","status":"Active","briefHash":"bafybeih3examplebriefcid","deadline":"2026-08-15T18:00:00.000Z","createdAt":"2026-06-18T09:42:11.000Z","updatedAt":"2026-06-21T08:10:00.000Z","createdLedger":"53188210","milestones":[{"id":311,"milestoneIndex":0,"title":"Design system and landing page","amount":"750000000","status":"Approved","submittedAt":"2026-06-20T12:30:00.000Z","resolvedAt":"2026-06-21T08:10:00.000Z"}],"dispute":null}
```

| Status | Response |
| --- | --- |
| 200 | Full escrow with `milestones` and nullable `dispute` |
| 400 | Validator `errors[]`, or `{"error":"Invalid escrow id"}` |
| 404 | `{"error":"Escrow not found"}` |
| 401/403/429/500 | Shared responses |
