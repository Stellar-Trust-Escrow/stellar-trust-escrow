# Error Codes Reference

All public contract functions return `Result<T, EscrowError>`. When a transaction fails, the Soroban diagnostic stream includes the `EscrowError` discriminant as a `u32`.

Reserved discriminants currently in use as placeholders are `7`, `11`, and `24`. Discriminant `22` is now used for the reentrancy guard, and `23` is used for dispute-timeout enforcement.

## Initialization (1-2)

| Code | Name                 | Meaning                                              |
| ---- | -------------------- | ---------------------------------------------------- |
| 1    | `AlreadyInitialized` | Contract setup was attempted more than once.         |
| 2    | `NotInitialized`     | A guarded function was called before initialization. |

## Authorization (3-6)

| Code | Name           | Meaning                                       |
| ---- | -------------- | --------------------------------------------- |
| 3    | `Unauthorized` | Caller is not allowed to perform this action. |
| 4    | `AdminOnly`    | Action requires the contract admin.           |
| 5    | `ClientOnly`   | Action requires the escrow client.            |
| 6    | _(unused)_     | No current variant.                           |

## Escrow State (7-12)

| Code | Name                | Meaning                                                      |
| ---- | ------------------- | ------------------------------------------------------------ |
| 7    | `Reserved7`         | Reserved for future use.                                     |
| 8    | `EscrowNotFound`    | No escrow exists for the requested `escrow_id`.              |
| 9    | `EscrowNotActive`   | Operation requires an active escrow.                         |
| 10   | `EscrowNotDisputed` | Operation requires a disputed escrow.                        |
| 11   | `Reserved11`        | Reserved for future use.                                     |
| 12   | `PendingFunds`      | Cancellation is blocked because milestone funds are pending. |

## Milestones (13-17)

| Code | Name                     | Meaning                                                 |
| ---- | ------------------------ | ------------------------------------------------------- |
| 13   | `MilestoneNotFound`      | No milestone exists for the requested `milestone_id`.   |
| 14   | `InvalidMilestoneState`  | Milestone is not in the expected state for this action. |
| 15   | `MilestoneAmountExceeds` | Milestone total would exceed the escrow amount.         |
| 16   | `TooManyMilestones`      | Maximum milestone count would be exceeded.              |
| 17   | `InvalidMilestoneAmount` | Milestone amount is zero or negative.                   |

## Funds And Disputes (18-24)

| Code | Name                       | Meaning                                                  |
| ---- | -------------------------- | -------------------------------------------------------- |
| 18   | _(unused)_                 | No current variant.                                      |
| 19   | `InvalidEscrowAmount`      | Escrow amount is invalid.                                |
| 20   | `AmountMismatch`           | Arithmetic or distribution amounts do not line up.       |
| 21   | _(unused)_                 | No current variant.                                      |
| 22   | `ReentrancyBlocked`        | Reentrant payout flow was blocked by the contract guard. |
| 23   | `DisputeTimeoutNotReached` | Dispute timeout has not elapsed yet.                     |
| 24   | `Reserved24`               | Reserved for future use.                                 |

## Deadlines And Locking (25-31)

| Code | Name                   | Meaning                             |
| ---- | ---------------------- | ----------------------------------- |
| 25   | _(unused)_             | No current variant.                 |
| 26   | `DeadlineExpired`      | Escrow deadline has already passed. |
| 27   | _(unused)_             | No current variant.                 |
| 28   | `LockTimeNotExpired`   | Funds are still locked.             |
| 29   | _(unused)_             | No current variant.                 |
| 30   | `InvalidLockExtension` | Lock extension is invalid.          |
| 31   | `ContractPaused`       | Contract is paused.                 |

## Cancellations (32-37)

| Code | Name                    | Meaning                                         |
| ---- | ----------------------- | ----------------------------------------------- |
| 32   | `CancellationNotFound`  | No cancellation request exists.                 |
| 33   | `CancelAlreadyExists`   | Cancellation request already exists.            |
| 34   | `CancelAlreadyDisputed` | Cancellation request has already been disputed. |
| 35   | `CancelPeriodActive`    | Cancellation dispute window is still open.      |
| 36   | `CancelDeadlineExpired` | Cancellation dispute deadline has passed.       |
| 37   | `CancellationDisputed`  | Cancellation is blocked by an active dispute.   |

## Slashing (38-41)

| Code | Name                   | Meaning                                        |
| ---- | ---------------------- | ---------------------------------------------- |
| 38   | `SlashNotFound`        | No slash record exists.                        |
| 39   | `SlashAlreadyDisputed` | Slash has already been disputed.               |
| 40   | `SlashDeadlineExpired` | Slash dispute deadline has passed.             |
| 41   | `SlashAlreadyApplied`  | A slash record already exists for this escrow. |

## Migration And Recurring (42-47)

| Code | Name                 | Meaning                                      |
| ---- | -------------------- | -------------------------------------------- |
| 42   | `MigrationFailed`    | Storage migration failed.                    |
| 43   | `RecurringNotFound`  | Recurring payment config was not found.      |
| 44   | `InvalidRecurring`   | Recurring schedule configuration is invalid. |
| 45   | `NoRecurringDue`     | No recurring payment is currently due.       |
| 46   | `RecurringPaused`    | Recurring schedule is paused.                |
| 47   | `RecurringCancelled` | Recurring schedule has been cancelled.       |
