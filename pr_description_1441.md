# Async Escrow-History Export (CSV / XLSX)

## Summary

Implements asynchronous, background-job based export of escrow history, as
described in issue #1441. Large exports no longer block the request/response
cycle: the API enqueues a job, the client polls for progress, and the finished
file is served through a short-lived, signed download URL.

## Backend

- **Queue (`backend/queues/exportQueue.js`)** — a dedicated BullMQ
  `escrow-export` queue and worker. Under `NODE_ENV=test` it falls back to a
  lightweight in-memory queue so unit/integration tests run without Redis.
- **Service (`backend/services/exportService.js`)**
  - Cursor-paginated streaming of matching escrows (constant memory, safe for
    very large result sets).
  - Streaming **CSV** generation via `fast-csv` and **XLSX** via `exceljs`.
  - Job status persisted in the cache (Redis with in-memory fallback) under
    `export:job:${jobId}` with a 1-hour TTL, tracking `pending → processing →
done | failed` and progress `0–100`.
  - Download URLs: uploads to **S3** and returns a presigned URL when
    `AWS_S3_BUCKET` is configured; otherwise falls back to a locally
    **HMAC-signed, 15-minute** download endpoint.
- **Controller / Routes**
  - `POST /api/v1/escrows/export` (auth) — validates the request and returns
    `202 { jobId, estimatedSeconds }`.
  - `GET /api/v1/escrows/export/:jobId/status` (auth) — returns
    `{ status, progress, downloadUrl?, error? }`.
  - `GET /api/v1/escrows/export/:jobId/download` (public) — access is granted by
    the HMAC signature + expiry in the URL; returns `410` when expired and `403`
    on a bad signature, otherwise streams the file.
  - The export routes are mounted **before** `/escrows` so the more specific
    prefix wins over the escrow `/:id` catch-all.
- **Worker lifecycle** — the export worker is started alongside the existing
  workers in `server.js` and closed on graceful shutdown.

### Export columns

`escrow_id, status, client_address, freelancer_address, total_amount, token,
milestones_count, milestones_approved, created_at, updated_at,
dispute_raised_at, resolved_at`

## Frontend

- **`frontend/hooks/useEscrowExport.ts`** — enqueues the export, polls status
  every 3s, exposes `phase`/`progress`/`downloadUrl`/`error`, supports `retry`,
  auto-dismisses ~10s after completion, and cleans up all timers on unmount.
- **`frontend/components/escrow/ExportModal.jsx`** — format selection (CSV /
  XLSX), date-range and status filters, a live progress bar, a signed download
  button, and inline error + retry. Uses native date inputs (zero new deps) and
  follows the existing `*Modal.jsx` convention in `components/escrow/`.

## Tests

- `backend/tests/unit/exportService.test.js` — filter building, row mapping
  (incl. approved-milestone counting and dispute dates), job creation/estimate,
  signed-URL validity/expiry/tamper, and CSV/XLSX generation + the failure path.
- `backend/tests/integration/export.test.js` — full HTTP flow: validation
  errors, `202` enqueue, `pending → done` status lifecycle, and download
  responses for valid / expired / tampered signatures.

## Notes

- New backend dependencies: `exceljs`, `fast-csv`.
- S3 is optional; without `AWS_S3_BUCKET` the locally-signed endpoint is used.
- Pre-existing, unrelated failures on `develop` (some backend suites and a few
  frontend files) are outside the scope of this change and untouched here.

closes #1441
