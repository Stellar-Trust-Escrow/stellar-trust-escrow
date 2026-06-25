# Users API

Base path: `/api/users`. All endpoints require JWT. Export/import/file routes also require the path address to equal the JWT `address`. Shared responses: [API index](./README.md#shared-responses). Addresses match `^G[A-Z2-7]{55}$`.

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/users/:address` | Profile, reputation, recent escrows |
| GET | `/api/users/:address/escrows` | User escrows |
| GET | `/api/users/:address/stats` | User statistics |
| GET | `/api/users/:address/export` | Export data |
| POST | `/api/users/:address/import` | Import data |
| GET | `/api/users/:address/export/file` | Download export |

## GET `/api/users/:address`

```bash
curl http://localhost:3001/api/users/GBZXN7PIRZGNMHGA4YFQQI6K7JMVKQ2DMQF3KWPZSSIJ7H5V7XKQXLMR -H "Authorization: Bearer $TOKEN"
```

```json
{"address":"GBZXN7PIRZGNMHGA4YFQQI6K7JMVKQ2DMQF3KWPZSSIJ7H5V7XKQXLMR","displayName":"Maya Chen","bio":"Product designer working with Stellar teams.","avatarUrl":"/uploads/avatar.webp","preferences":{"currency":"USD"},"reputation":{"address":"GBZXN7PIRZGNMHGA4YFQQI6K7JMVKQ2DMQF3KWPZSSIJ7H5V7XKQXLMR","totalScore":"9450","completedEscrows":18,"disputedEscrows":1,"disputesWon":1,"totalVolume":"12850000000"},"recentEscrows":[{"id":"1042","status":"Active","totalAmount":"2500000000","remainingBalance":"1750000000","deadline":"2026-08-15T18:00:00.000Z","createdAt":"2026-06-18T09:42:11.000Z","clientAddress":"GBZXN7PIRZGNMHGA4YFQQI6K7JMVKQ2DMQF3KWPZSSIJ7H5V7XKQXLMR","freelancerAddress":"GDQP2WX3YJQZC6KLE5Q7PH7L4QK6RFKX2HM5FMVNNK7KXQMS3RYM4B7A"}]}
```

| Status | Response |
| --- | --- |
| 200 | Profile above; missing reputation becomes a zero-valued object |
| 400 | `{"errors":[{"msg":"Invalid Stellar address","path":"address","location":"params"}]}` |
| 401/403/404/429/500 | Shared responses |

## GET `/api/users/:address/escrows`

Query: `page` (>=1), `limit` (1-100), `role` (`client|freelancer|all`, other values act as `all`), `status` (database enum value).

```bash
curl 'http://localhost:3001/api/users/GBZXN7PIRZGNMHGA4YFQQI6K7JMVKQ2DMQF3KWPZSSIJ7H5V7XKQXLMR/escrows?role=client&status=Active' -H "Authorization: Bearer $TOKEN"
```

```json
{"data":[{"id":"1042","status":"Active","totalAmount":"2500000000","remainingBalance":"1750000000","deadline":"2026-08-15T18:00:00.000Z","createdAt":"2026-06-18T09:42:11.000Z"}],"page":1,"limit":20,"total":1,"totalPages":1,"hasNextPage":false,"hasPreviousPage":false}
```

| Status | Response |
| --- | --- |
| 200 | Paginated summaries |
| 400 | Address/pagination validator `errors[]` |
| 500 | `{"error":"<message>"}`; invalid status can reach this branch |
| 401/403/404/429 | Shared responses |

## GET `/api/users/:address/stats`

```bash
curl http://localhost:3001/api/users/GBZXN7PIRZGNMHGA4YFQQI6K7JMVKQ2DMQF3KWPZSSIJ7H5V7XKQXLMR/stats -H "Authorization: Bearer $TOKEN"
```

```json
{"address":"GBZXN7PIRZGNMHGA4YFQQI6K7JMVKQ2DMQF3KWPZSSIJ7H5V7XKQXLMR","totalEscrows":20,"completionRate":"0.9000","escrowsByStatus":{"Completed":18,"Active":1,"Disputed":1},"reputation":{"totalScore":"9450","completedEscrows":18,"disputedEscrows":1,"totalVolume":"12850000000"}}
```

| Status | Response |
| --- | --- |
| 200 | Stats above; `reputation` may be null |
| 400 | Address validator `errors[]` |
| 401/403/404/429/500 | Shared responses |

## GET `/api/users/:address/export`

```bash
curl http://localhost:3001/api/users/GBZXN7PIRZGNMHGA4YFQQI6K7JMVKQ2DMQF3KWPZSSIJ7H5V7XKQXLMR/export -H "Authorization: Bearer $TOKEN"
```

```json
{"version":"1.0","exportedAt":"2026-06-25T11:05:32.000Z","userAddress":"GBZXN7PIRZGNMHGA4YFQQI6K7JMVKQ2DMQF3KWPZSSIJ7H5V7XKQXLMR","data":{"escrows":[{"id":"1042","clientAddress":"GBZXN7PIRZGNMHGA4YFQQI6K7JMVKQ2DMQF3KWPZSSIJ7H5V7XKQXLMR","freelancerAddress":"GDQP2WX3YJQZC6KLE5Q7PH7L4QK6RFKX2HM5FMVNNK7KXQMS3RYM4B7A","arbiterAddress":null,"tokenAddress":"CCW67TSZIT3Y4Y2Q2L3Y57U5YZ64KDXT7YAZB6ON5AC5B4BQBQKGI2FZ","totalAmount":"2500000000","remainingBalance":"1750000000","status":"Active","briefHash":"bafybeih3examplebriefcid","deadline":"2026-08-15T18:00:00.000Z","createdAt":"2026-06-18T09:42:11.000Z","createdLedger":"53188210","milestones":[],"dispute":null}],"payments":[],"kyc":{"status":"APPROVED","reviewResult":"GREEN","rejectLabels":[]},"reputation":{"totalScore":"9450","completedEscrows":18,"disputedEscrows":1,"disputesWon":1,"totalVolume":"12850000000"}}}
```

| Status | Response |
| --- | --- |
| 200 | Versioned export above |
| 400 | `{"error":"Invalid Stellar address"}` or `{"error":"Invalid Stellar address format"}` |
| 403 | `{"error":"Authenticated user is not linked to a wallet address."}` or `{"error":"Forbidden: cannot access another wallet address."}` |
| 500 | `{"error":"Failed to export user data"}` |
| 401/404/429 | Shared responses |

## POST `/api/users/:address/import`

Body: `data` (required complete export object) and `mode` (`merge` default; `replace` currently behaves as merge).

```bash
curl -X POST http://localhost:3001/api/users/GBZXN7PIRZGNMHGA4YFQQI6K7JMVKQ2DMQF3KWPZSSIJ7H5V7XKQXLMR/import -H "Authorization: Bearer $TOKEN" -H "X-CSRF-Token: $CSRF_TOKEN" -H 'Content-Type: application/json' -b "csrf_token=$CSRF_TOKEN" -d '{"mode":"merge","data":{"version":"1.0","userAddress":"GBZXN7PIRZGNMHGA4YFQQI6K7JMVKQ2DMQF3KWPZSSIJ7H5V7XKQXLMR","data":{"escrows":[],"payments":[],"kyc":null,"reputation":{"totalScore":"9450"}}}}'
```

```json
{"success":true,"results":{"escrows":{"imported":0,"skipped":0,"errors":[]},"payments":{"imported":0,"skipped":0,"errors":[]},"reputation":{"imported":1,"skipped":0,"errors":[]}}}
```

| Status | Response |
| --- | --- |
| 200 | Result above; individual failures are in `results.*.errors` |
| 400 | `{"error":"Missing data to import"}` |
| 400 | `{"error":"Invalid data format","details":["Missing or invalid version field"]}` |
| 403 | Ownership/CSRF responses described above/index |
| 500 | `{"error":"Failed to import user data"}` |
| 401/404/429 | Shared responses |

## GET `/api/users/:address/export/file`

```bash
curl -OJ http://localhost:3001/api/users/GBZXN7PIRZGNMHGA4YFQQI6K7JMVKQ2DMQF3KWPZSSIJ7H5V7XKQXLMR/export/file -H "Authorization: Bearer $TOKEN"
```

`200` returns the export JSON with `Content-Disposition: attachment; filename="stellar-trust-export-<address>.json"`.

| Status | Response |
| --- | --- |
| 200 | Same JSON shape as export, as a download |
| 400/403 | Address/ownership responses above |
| 500 | `{"error":"Failed to generate export file"}` |
| 401/404/429 | Shared responses |
