# Disputes API

Base path: `/api/disputes`. All endpoints require JWT and are tenant-scoped. Shared responses: [API index](./README.md#shared-responses). `:escrowId` is an escrow ID; other `:id` values are dispute IDs.

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/disputes` | List disputes |
| GET | `/api/disputes/history` | Resolution history |
| GET | `/api/disputes/:escrowId` | Get dispute by escrow |
| POST | `/api/disputes/:id/evidence` | Add evidence |
| GET | `/api/disputes/:id/evidence` | List evidence |
| POST | `/api/disputes/:id/resolve/auto` | Auto-resolve |
| GET | `/api/disputes/:id/resolve/recommendation` | Recommendation |
| POST | `/api/disputes/:id/appeals` | File appeal |
| PATCH | `/api/disputes/appeals/:appealId` | Update appeal |

## GET `/api/disputes`

Query: `page` (1-1,000,000), `limit` (validator 1-100; controller cap 50), `status` (`resolved|unresolved`), `raisedBy`, `dateFrom`, `dateTo`, `sortBy` (`raisedAt|resolvedAt|id`), `sortOrder` (`asc|desc`).

```bash
curl 'http://localhost:3001/api/disputes?status=unresolved&sortBy=raisedAt&page=1&limit=20' -H "Authorization: Bearer $TOKEN"
```

```json
{"data":[{"id":73,"tenantId":"clx4tenant0001","escrowId":"1042","raisedByAddress":"GDQP2WX3YJQZC6KLE5Q7PH7L4QK6RFKX2HM5FMVNNK7KXQMS3RYM4B7A","raisedAt":"2026-06-23T13:10:00.000Z","resolvedAt":null,"clientAmount":null,"freelancerAmount":null,"resolvedBy":null,"resolution":null,"resolutionType":null,"autoResolved":false,"escrow":{"clientAddress":"GBZXN7PIRZGNMHGA4YFQQI6K7JMVKQ2DMQF3KWPZSSIJ7H5V7XKQXLMR","freelancerAddress":"GDQP2WX3YJQZC6KLE5Q7PH7L4QK6RFKX2HM5FMVNNK7KXQMS3RYM4B7A","totalAmount":"2500000000","status":"Disputed"},"evidence":[],"_count":{"evidence":0,"appeals":0}}],"page":1,"limit":20,"total":1,"totalPages":1,"hasNextPage":false,"hasPreviousPage":false}
```

| Status | Response |
| --- | --- |
| 200 | Paginated disputes above |
| 400 | `{"error":"Validation failed","details":[{"field":"page","message":"page must be an integer between 1 and 1000000","location":"query"}]}` |
| 400 | Invalid sort/date, e.g. `{"error":"Invalid sortBy value","allowed":["raisedAt","resolvedAt","id"]}` |
| 500 | `{"error":"Failed to list disputes"}` |
| 401/403/404/429 | Shared responses |

## GET `/api/disputes/history`

Query: `page`, `limit` (parsed, not validated).

```bash
curl 'http://localhost:3001/api/disputes/history?page=1&limit=20' -H "Authorization: Bearer $TOKEN"
```

Current code passes the wrong arguments to the pagination builder. Its `200` shape is malformed: `data` contains `{items,total,page,limit,request}`, top-level `page`, `limit`, and `total` are omitted, and `totalPages` is `null`.

```json
{"data":{"items":[{"id":69,"escrowId":"1018","resolvedAt":"2026-06-12T15:40:00.000Z","resolution":"Milestone amount split after manual review","escrow":{"clientAddress":"GBZXN7PIRZGNMHGA4YFQQI6K7JMVKQ2DMQF3KWPZSSIJ7H5V7XKQXLMR","freelancerAddress":"GDQP2WX3YJQZC6KLE5Q7PH7L4QK6RFKX2HM5FMVNNK7KXQMS3RYM4B7A","totalAmount":"1800000000"}}],"total":1,"page":1,"limit":20,"request":{}},"totalPages":null,"hasNextPage":false,"hasPreviousPage":false}
```

| Status | Response |
| --- | --- |
| 200 | Malformed current envelope above |
| 500 | `{"error":"Failed to get resolution history"}` |
| 401/403/404/429 | Shared responses |

## GET `/api/disputes/:escrowId`

`escrowId`: 1-20 decimal digits, range 1 through 18446744073709551615.

```bash
curl http://localhost:3001/api/disputes/1042 -H "Authorization: Bearer $TOKEN"
```

```json
{"id":73,"escrowId":"1042","raisedByAddress":"GDQP2WX3YJQZC6KLE5Q7PH7L4QK6RFKX2HM5FMVNNK7KXQMS3RYM4B7A","raisedAt":"2026-06-23T13:10:00.000Z","resolvedAt":null,"clientAmount":null,"freelancerAmount":null,"resolvedBy":null,"resolution":null,"resolutionType":null,"autoResolved":false,"escrow":{"clientAddress":"GBZXN7PIRZGNMHGA4YFQQI6K7JMVKQ2DMQF3KWPZSSIJ7H5V7XKQXLMR","freelancerAddress":"GDQP2WX3YJQZC6KLE5Q7PH7L4QK6RFKX2HM5FMVNNK7KXQMS3RYM4B7A","arbiterAddress":null,"tokenAddress":"CCW67TSZIT3Y4Y2Q2L3Y57U5YZ64KDXT7YAZB6ON5AC5B4BQBQKGI2FZ","totalAmount":"2500000000","remainingBalance":"1750000000","status":"Disputed","deadline":"2026-08-15T18:00:00.000Z","createdAt":"2026-06-18T09:42:11.000Z"},"evidence":[],"appeals":[]}
```

Evidence with CIDs also gets `fileUrl`/`thumbnailUrl`.

| Status | Response |
| --- | --- |
| 200 | Full dispute above |
| 400 | Structured `Validation failed` response |
| 404 | `{"error":"Dispute not found"}` |
| 500 | `{"error":"Failed to get dispute"}` |
| 401/403/429 | Shared responses |

## POST `/api/disputes/:id/evidence`

`multipart/form-data`: optional `files` (max 5, 10 MiB each), optional `description` (required when no files), optional `role`. Allowed: JPEG, PNG, GIF, WebP, PDF, text, Word, Excel, CSV, ZIP.

```bash
curl -X POST http://localhost:3001/api/disputes/73/evidence -H "Authorization: Bearer $TOKEN" -H "X-CSRF-Token: $CSRF_TOKEN" -b "csrf_token=$CSRF_TOKEN" -F 'description=Final delivery and approval email' -F 'role=freelancer' -F 'files=@./approval-email.pdf;type=application/pdf'
```

Intended success:

```json
{"message":"Evidence uploaded successfully","evidence":[{"id":204,"disputeId":73,"submittedBy":"GDQP2WX3YJQZC6KLE5Q7PH7L4QK6RFKX2HM5FMVNNK7KXQMS3RYM4B7A","role":"freelancer","evidenceType":"file","content":"bafybeigexampleevidencecid","description":"Final delivery and approval email","filename":"approval-email.pdf","mimeType":"application/pdf","fileSize":284193,"ipfsCid":"bafybeigexampleevidencecid","thumbnailCid":null,"scanStatus":"clean","submittedAt":"2026-06-25T11:42:00.000Z","fileUrl":"https://gateway.example/ipfs/bafybeigexampleevidencecid"}],"count":1}
```

Implementation defect: wallet auth sets `req.user={address,jti}`, but upload access requires `req.user.userId`. Current wallet JWTs therefore return `401 User not authenticated` before success.

| Status | Response |
| --- | --- |
| 201 | Intended result above |
| 400 | `{"error":"No evidence provided","message":"Either files or text description is required"}` |
| 400 | Too many files, disallowed MIME, or `{"error":"Virus detected","message":"...","infectedFiles":[...]}` |
| 401 | `{"error":"User not authenticated"}` |
| 403 | `{"error":"Access denied"}` |
| 404 | `{"error":"Dispute not found"}` |
| 413 | `{"error":"File size exceeds 10MB limit"}` |
| 500 | Validation, virus scan, IPFS, or `{"error":"Failed to post evidence"}` |
| 401/403/404/429 | Shared responses also apply |

## GET `/api/disputes/:id/evidence`

Query: `page`, `limit`, `evidenceType`, `submittedBy` (parsed, not route-validated).

```bash
curl 'http://localhost:3001/api/disputes/73/evidence?evidenceType=file' -H "Authorization: Bearer $TOKEN"
```

```json
{"data":[{"id":204,"disputeId":73,"submittedBy":"GDQP2WX3YJQZC6KLE5Q7PH7L4QK6RFKX2HM5FMVNNK7KXQMS3RYM4B7A","role":"freelancer","evidenceType":"file","content":"bafybeigexampleevidencecid","filename":"approval-email.pdf","ipfsCid":"bafybeigexampleevidencecid","scanStatus":"clean","submittedAt":"2026-06-25T11:42:00.000Z","fileUrl":"https://gateway.example/ipfs/bafybeigexampleevidencecid"}],"page":1,"limit":20,"total":1,"totalPages":1,"hasNextPage":false,"hasPreviousPage":false}
```

| Status | Response |
| --- | --- |
| 200 | Paginated evidence; unknown dispute returns empty list |
| 500 | `{"error":"Failed to list evidence"}` |
| 401/403/404/429 | Shared responses |

## POST `/api/disputes/:id/resolve/auto`

No body. Intended `200`:

```bash
curl -X POST http://localhost:3001/api/disputes/73/resolve/auto -H "Authorization: Bearer $TOKEN" -H "X-CSRF-Token: $CSRF_TOKEN" -b "csrf_token=$CSRF_TOKEN"
```

```json
{"message":"Dispute auto-resolved successfully","resolution":{"id":73,"escrowId":"1042","resolvedAt":"2026-06-25T12:02:00.000Z","resolvedBy":"system","resolutionType":"AUTO","autoResolved":true,"resolution":"Automatically resolved based on evidence and contract terms"}}
```

No route middleware populates `req.dispute`, so current behavior normally reaches the `500` branch.

| Status | Response |
| --- | --- |
| 200 | Intended resolution result above |
| 500 | `{"error":"Failed to auto-resolve dispute"}` |
| 401/403/404/429 | Shared responses |

## GET `/api/disputes/:id/resolve/recommendation`

```bash
curl http://localhost:3001/api/disputes/73/resolve/recommendation -H "Authorization: Bearer $TOKEN"
```

Intended `200`:

```json
{"disputeId":73,"recommendation":{"suggestedOutcome":"favor_freelancer","confidence":0.8,"reasoning":["Documentary evidence provided","Freelancer provided significantly more evidence"]},"evidenceCount":4,"generatedAt":"2026-06-25T12:05:00.000Z"}
```

No middleware populates `req.dispute`, so current behavior normally reaches the `500` branch.

| Status | Response |
| --- | --- |
| 200 | Intended recommendation above |
| 500 | `{"error":"Failed to get recommendation"}` |
| 401/403/404/429 | Shared responses |

## POST `/api/disputes/:id/appeals`

Body: `reason` (required non-empty string).

```bash
curl -X POST http://localhost:3001/api/disputes/73/appeals -H "Authorization: Bearer $TOKEN" -H "X-CSRF-Token: $CSRF_TOKEN" -H 'Content-Type: application/json' -b "csrf_token=$CSRF_TOKEN" -d '{"reason":"The resolution omitted the signed acceptance email."}'
```

Intended `201`:

```json
{"message":"Appeal filed successfully","appeal":{"id":18,"disputeId":73,"appealedBy":"GDQP2WX3YJQZC6KLE5Q7PH7L4QK6RFKX2HM5FMVNNK7KXQMS3RYM4B7A","reason":"The resolution omitted the signed acceptance email.","status":"pending","reviewedBy":null,"reviewNotes":null,"createdAt":"2026-06-25T12:12:00.000Z","resolvedAt":null}}
```

No middleware populates `req.dispute`; the handler also reads `walletAddress`/`userAddress`, not the JWT `address`.

| Status | Response |
| --- | --- |
| 201 | Intended result above |
| 400 | `{"error":"Appeal reason is required"}` |
| 500 | `{"error":"Failed to post appeal"}` |
| 401/403/404/429 | Shared responses |

## PATCH `/api/disputes/appeals/:appealId`

Body fields are optional/unvalidated: `status`, `reviewNotes`. `approved` or `rejected` sets `resolvedAt`. There is no role/ownership guard beyond JWT.

```bash
curl -X PATCH http://localhost:3001/api/disputes/appeals/18 -H "Authorization: Bearer $TOKEN" -H "X-CSRF-Token: $CSRF_TOKEN" -H 'Content-Type: application/json' -b "csrf_token=$CSRF_TOKEN" -d '{"status":"approved","reviewNotes":"Acceptance email verified."}'
```

```json
{"message":"Appeal updated successfully","appeal":{"id":18,"disputeId":73,"appealedBy":"GDQP2WX3YJQZC6KLE5Q7PH7L4QK6RFKX2HM5FMVNNK7KXQMS3RYM4B7A","reason":"The resolution omitted the signed acceptance email.","status":"approved","reviewedBy":null,"reviewNotes":"Acceptance email verified.","createdAt":"2026-06-25T12:12:00.000Z","resolvedAt":"2026-06-25T12:30:00.000Z"}}
```

| Status | Response |
| --- | --- |
| 200 | Updated appeal above |
| 404 | `{"error":"Appeal not found"}` |
| 500 | `{"error":"Failed to update appeal"}` |
| 401/403/429 | Shared responses |
