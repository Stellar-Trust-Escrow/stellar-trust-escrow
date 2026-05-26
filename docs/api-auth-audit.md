# API Authentication and Authorization Audit

Date: `2026-03-27`

This audit reviewed every backend API route for:

- Authentication coverage
- Resource-level authorization
- Administrative endpoint isolation
- Public endpoint justification

## Summary

The backend previously mixed app-level route guards, per-route admin checks, webhook signatures, and several completely open sensitive endpoints. The result was inconsistent enforcement and multiple horizontal-access risks for wallet-scoped resources.

This pass standardizes protection as follows:

- Sensitive user routes are protected in the router itself with JWT auth.
- Wallet-scoped endpoints enforce ownership using the wallet address embedded in the JWT.
- Internal/admin operations use `x-admin-api-key`.
- Webhook endpoints remain public but rely on provider signature verification.
- Public read-only endpoints remain explicitly documented as public.

## Protected Endpoint Matrix

| Route Group | Protection | Notes |
| --- | --- | --- |
| `/api/auth/register` | Public | Tenant-scoped registration |
| `/api/auth/login` | Public | Returns JWT with wallet address claim when linked |
| `/api/auth/refresh` | Public | Refresh token validation required |
| `/api/auth/logout` | Bearer JWT | Logout is no longer open |
| `/api/tenant` | Public | Tenant discovery only |
| `/api/health` and `/health` | Public | Operational health endpoints |
| `/api/escrows/*` | Bearer JWT | Router-level protection |
| `/api/users/:address` | Bearer JWT | Authenticated profile access |
| `/api/users/:address/export*` | Bearer JWT + wallet ownership | Export/import/file download restricted to the authenticated wallet |
| `/api/reputation/*` | Public | Public reputation data |
| `/api/disputes/*` | Bearer JWT | Router-level protection |
| `/api/events/*` | Public | Indexed on-chain event data |
| `/api/search` and `/api/search/suggest` | Public | Public discovery endpoints |
| `/api/search/analytics` and `/api/search/reindex` | Admin API key | Admin only |
| `/api/kyc/token` | Bearer JWT + wallet ownership | Caller can only mint a token for their own wallet |
| `/api/kyc/status/:address` | Bearer JWT + wallet ownership | Caller can only read their own KYC status |
| `/api/kyc/webhook` | Provider signature | Sumsub signature verification |
| `/api/kyc/admin` | Admin API key | Admin only |
| `/api/payments/checkout` | Bearer JWT + wallet ownership | Caller can only create checkout for their own wallet |
| `/api/payments/status/:sessionId` | Bearer JWT + payment ownership | Session lookup must belong to the authenticated wallet |
| `/api/payments/:address` | Bearer JWT + wallet ownership | Caller can only list their own payments |
| `/api/payments/:paymentId/refund` | Bearer JWT + payment ownership | Refund limited to owner of the payment |
| `/api/payments/webhook` | Provider signature | Stripe webhook signature verification |
| `/api/notifications/events` | Admin API key | Internal dispatch endpoint |
| `/api/notifications/queue` | Admin API key | Queue inspection is no longer public |
| `/api/notifications/unsubscribe` | Unsubscribe token | Link/API token validation |
| `/api/notifications/subscribe` | Resubscribe token | Resubscribe now requires the email token |
| `/api/relayer/execute` and `/api/relayer/fee-estimate` | Bearer JWT | Prevents anonymous relayer abuse |
| `/api/relayer/status` | Public | Operational status only |
| `/api/audit/*` | Admin API key | Admin only |
| `/api/compliance/*` | Admin API key | Admin only |
| `/api/incidents/*` | Admin API key | Admin only |
| `/api/admin/*` | Admin API key | Admin only |

## Implementation Notes

- JWTs now carry `address` when the user account is linked to a wallet address.
- `users.wallet_address` is persisted so ownership checks do not rely on client-supplied headers.
- Ownership middleware fails closed when the authenticated user has no linked wallet address.

## Tests Added

- Router protection tests for JWT-, admin-, and token-protected routes
- Payment controller authorization tests for session and refund ownership
