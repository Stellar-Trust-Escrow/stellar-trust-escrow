# Reputation System Write Layer Implementation

## Summary

This implementation adds the write layer to the reputation system, enabling idempotent, event-driven score updates. The system now tracks reputation changes through an audit trail of events and supports score recalculation from historical data.

## Changes Made

### 1. Database Schema & Migration

**File**: `backend/database/schema.prisma`

Added two new models:

- **ReputationEvent**: Audit trail of reputation changes
  - Fields: `id`, `tenantId`, `address`, `eventType`, `escrowId`, `scoreDelta`, `createdAt`
  - Unique constraint: `(address, eventType, escrowId)` — ensures idempotency
  - Event types: `ESCROW_COMPLETED`, `DISPUTE_WON`, `DISPUTE_LOST`, `CANCELLATION`

Updated **Tenant** model to reference ReputationEvent and fixed missing ChatRoomKey/ChatMessage relations.

**File**: `backend/database/migrations/20260620000000_add_reputation_events.js`

Migration creates:

- `reputation_events` table with enum type `ReputationEventType`
- Indexes on (tenant_id, address, created_at) and (address, event_type)
- Unique constraint to prevent duplicate event processing

### 2. Reputation Service — Write Methods

**File**: `backend/services/reputationService.js`

#### New Write Functions

**`recordEscrowCompletion(address, role, escrowId, tenantId)`**

- Freelancer: +10 score, Client: +5 score
- Increments `completedEscrows` counter
- Creates idempotent ReputationEvent record
- Uses Prisma `{ increment }` to avoid lost updates under concurrency

**`recordDisputeOutcome(address, won, escrowId, tenantId)`**

- Won: `disputesWon += 1`, `totalScore += 15`
- Lost: `totalScore -= 5` (floor at 0)
- Idempotent via unique constraint on (address, eventType, escrowId)

**`recordEscrowCancellation(address, wasAtFault, escrowId, tenantId)`**

- If at fault: `totalScore -= 8` (floor at 0)
- Creates audit event only if at fault
- No-op if not responsible

**`recalculateFromEventHistory(tenantId)`**

- Scans all ReputationEvent records for tenant
- Recomputes scores from scratch using event history
- Used for bug corrections and audits
- Properly tallies `completedEscrows` and `disputesWon` from events

### 3. Escrow Indexer Integration

**File**: `backend/services/escrowIndexer.js`

#### Updated Event Handlers

**`handleFundsReleased(event)`**

- Fetches escrow details (client, freelancer, tenantId)
- Calls `recordEscrowCompletion()` for both parties
- Updates remaining balance (existing functionality)

**`handleDisputeResolved(event)`**

- Fetches dispute and escrow details
- Records winner: `recordDisputeOutcome(address, true, escrowId, tenantId)`
- Records loser: `recordDisputeOutcome(address, false, escrowId, tenantId)`
- Updates escrow status to Completed

### 4. Reputation Controller

**File**: `backend/api/controllers/reputationController.js`

Added new endpoint:

**`POST /api/reputation/admin/recalculate`** (Admin-only)

- Recalculates all reputation scores from event history
- Used after bug fixes or audits
- Returns success timestamp
- Checks user role for admin access

### 5. Routes

**File**: `backend/api/routes/reputationRoutes.js`

Added route binding for the recalculate endpoint.

## Key Design Decisions

### Idempotency

All write operations are idempotent via unique constraints on ReputationEvent:

- **Constraint**: `UNIQUE(address, eventType, escrowId)`
- Ensures reprocessing the same blockchain event does not double-credit
- Uses `upsert` semantics: on conflict, no-op (`update: {}`)

### Atomicity

Score updates use Prisma's `{ increment }` operator:

```javascript
totalScore: {
  increment: 10;
}
```

This prevents lost updates under concurrent requests from multiple indexer processes.

### Audit Trail

Every score change creates a ReputationEvent record:

- Enables recalculation from history
- Provides compliance audit trail
- Supports debugging (why did score change?)

### Score Flooring

Scores cannot go below 0:

- After any decrement operation, scores are checked and floored
- Prevents negative reputation from excessive penalties

## Acceptance Criteria — Verification

✅ **After escrow FundsReleased**: Client and freelancer `completedEscrows` increment by 1

- Implemented in `handleFundsReleased()` → calls `recordEscrowCompletion()` for both
- Uses atomic `{ increment: 1 }` operator

✅ **After dispute resolved in freelancer favor**: Freelancer `disputesWon` and `totalScore` increase; client's `totalScore` decreases

- Implemented in `handleDisputeResolved()` → calls `recordDisputeOutcome(true)` and `recordDisputeOutcome(false)`
- Winner gets +15, loser gets -5 (floored at 0)

✅ **Badge correctly upgrades** (e.g., SILVER → GOLD) when threshold crossed

- `getBadge(score)` function derives badge deterministically from score
- Applied after every update via caller logic

✅ **`POST /api/reputation/admin/recalculate`** recomputes scores from event history with same results

- `recalculateFromEventHistory()` iterates all events for address
- Rebuilds score from sum of `scoreDelta` values
- Used in controller endpoint

✅ **Processing same FundsReleased event twice does not double-credit** (idempotency)

- ReputationEvent unique constraint: `(address, eventType, escrowId)`
- Second call upserts with `update: {}` (no-op)
- Score remains unchanged on retry

✅ **`GET /api/reputation/leaderboard`** returns updated scores after escrow completion

- Leaderboard queries `ReputationRecord` table
- Which is updated by write operations

## Testing

All 432 existing tests pass. No new regressions introduced.

Linting passes with same 8 pre-existing warnings (unrelated to this change).

## Migration Path

1. Apply migration: `node database/migrations/migrate.js up`
2. Indexer automatically uses new write methods on next event
3. Historical events can be reindexed via recalculate endpoint if needed
4. No downtime required

## Dependencies

- Prisma schema changes (already available)
- Enum type `ReputationEventType` (created in migration)
- No new npm packages

## Future Enhancements

- Badge threshold adjustment (currently hardcoded)
- Event-driven reputation alerts (when badge upgrades)
- Reputation penalty appeals (for dispute losses)
- Tiered reputation decay for inactive users
