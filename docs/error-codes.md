# Error Codes Reference

All public contract functions return `Result<T, EscrowError>`. When a transaction fails, the Soroban diagnostic stream includes the `EscrowError` discriminant as a `u32`. Use this table to map that value to a human-readable description.

Discriminants 7, 11, 22, and 24 are **reserved / unused** — they do not correspond to any current variant and are noted in the table for completeness.

---

## Initialization (1–2)

| Code | Name                 | User-facing description                | When it occurs                                                        |
| ---- | -------------------- | -------------------------------------- | --------------------------------------------------------------------- |
| 1    | `AlreadyInitialized` | Contract is already set up.            | `initialize` was called more than once.                               |
| 2    | `NotInitialized`     | Contract has not been initialized yet. | Any function requiring initialization was called before `initialize`. |

---

## Authorization (3–6)

| Code | Name             | User-facing description                                 | When it occurs                                                                      |
| ---- | ---------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 3    | `Unauthorized`   | You are not authorized to perform this action.          | Caller is not the client, freelancer, or a registered buyer signer.                 |
| 4    | `AdminOnly`      | This action requires contract admin privileges.         | Non-admin address called an admin-only function.                                    |
| 5    | `ClientOnly`     | This action can only be performed by the escrow client. | Non-client address called a client-only function (e.g. `reject_milestone`).         |
| 6    | `FreelancerOnly` | This action can only be performed by the freelancer.    | Non-freelancer address called a freelancer-only function (e.g. `submit_milestone`). |

---

## Escrow State (7–12)

| Code | Name                           | User-facing description                          | When it occurs                                                                             |
| ---- | ------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| 7    | _(reserved)_                   | —                                                | Unused discriminant.                                                                       |
| 8    | `EscrowNotFound`               | Escrow not found.                                | No escrow exists for the given `escrow_id`.                                                |
| 9    | `EscrowNotActive`              | This escrow is not currently active.             | Operation requires `Active` status but escrow is `Completed`, `Disputed`, or `Cancelled`.  |
| 10   | `EscrowNotDisputed`            | This escrow is not in a disputed state.          | Dispute-resolution function called on a non-disputed escrow.                               |
| 11   | _(reserved)_                   | —                                                | Unused discriminant.                                                                       |
| 12   | `CannotCancelWithPendingFunds` | Cannot cancel while milestone funds are pending. | Cancellation attempted while at least one milestone is in `Submitted` or `Approved` state. |

---

## Milestone (13–17)

| Code | Name                           | User-facing description                                 | When it occurs                                                          |
| ---- | ------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------- |
| 13   | `MilestoneNotFound`            | Milestone not found.                                    | No milestone exists for the given `milestone_id` within this escrow.    |
| 14   | `InvalidMilestoneState`        | Milestone is not in the required state for this action. | e.g. `approve_milestone` called on a milestone that is not `Submitted`. |
| 15   | `MilestoneAmountExceedsEscrow` | Milestone amount exceeds the escrow balance.            | Adding this milestone would push the total above `total_amount`.        |
| 16   | `TooManyMilestones`            | Maximum number of milestones reached.                   | Milestone count would overflow the allowed maximum.                     |
| 17   | `InvalidMilestoneAmount`       | Milestone amount must be greater than zero.             | Milestone amount is zero or negative.                                   |

---

## Funds (18–21)

| Code | Name                  | User-facing description                              | When it occurs                                                                                  |
| ---- | --------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 18   | `TransferFailed`      | Token transfer failed.                               | SAC `transfer` call returned an error.                                                          |
| 19   | `InvalidEscrowAmount` | Escrow amount must be greater than zero.             | `total_amount` is zero or negative at creation time.                                            |
| 20   | `AmountMismatch`      | Amount does not match expected value.                | Deposited amount differs from the sum of milestone amounts, or an arithmetic overflow occurred. |
| 21   | `InvalidEscrowState`  | Escrow is in an unexpected state for this operation. | Funds operation attempted on an escrow in an incompatible state.                                |

---

## Dispute (22–23)

| Code | Name                   | User-facing description                    | When it occurs                                           |
| ---- | ---------------------- | ------------------------------------------ | -------------------------------------------------------- |
| 22   | _(reserved)_           | —                                          | Unused discriminant.                                     |
| 23   | `DisputeAlreadyExists` | A dispute is already open for this escrow. | `raise_dispute` called when a dispute is already active. |

---

## Deadline (24–26)

| Code | Name              | User-facing description           | When it occurs                                      |
| ---- | ----------------- | --------------------------------- | --------------------------------------------------- |
| 24   | _(reserved)_      | —                                 | Unused discriminant.                                |
| 25   | `InvalidDeadline` | The provided deadline is invalid. | Deadline timestamp is in the past at creation time. |
| 26   | `DeadlineExpired` | The escrow deadline has passed.   | Operation attempted after the escrow deadline.      |

---

## Time Lock (27–31)

| Code | Name                       | User-facing description              | When it occurs                                                   |
| ---- | -------------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| 27   | `InvalidLockTime`          | Lock time must be in the future.     | `lock_time` provided at creation is already in the past.         |
| 28   | `LockTimeNotExpired`       | Funds are still locked.              | Release attempted before `lock_time` has passed.                 |
| 29   | `LockTimeExpired`          | The lock time has already expired.   | Operation that requires an active lock called after expiry.      |
| 30   | `InvalidLockTimeExtension` | Cannot extend lock time to the past. | Extension timestamp is earlier than the current ledger time.     |
| 31   | `ContractPaused`           | The contract is currently paused.    | Any state-changing function called while the contract is paused. |

---

## Cancellation (32–37)

| Code | Name                                 | User-facing description                        | When it occurs                                                   |
| ---- | ------------------------------------ | ---------------------------------------------- | ---------------------------------------------------------------- |
| 32   | `CancellationNotFound`               | No cancellation request found for this escrow. | Cancellation operation called when no request exists.            |
| 33   | `CancellationAlreadyExists`          | A cancellation request already exists.         | `request_cancellation` called when a request is already pending. |
| 34   | `CancellationAlreadyDisputed`        | This cancellation has already been disputed.   | Dispute raised against a cancellation that was already disputed. |
| 35   | `CancellationDisputePeriodActive`    | The dispute window is still open.              | Cancellation execution attempted before the dispute deadline.    |
| 36   | `CancellationDisputeDeadlineExpired` | The dispute window has closed.                 | Dispute raised after the cancellation dispute deadline.          |
| 37   | `CancellationDisputed`               | Cancellation is blocked by an active dispute.  | Execution attempted on a disputed cancellation.                  |

---

## Slashing (38–41)

| Code | Name                          | User-facing description                 | When it occurs                                            |
| ---- | ----------------------------- | --------------------------------------- | --------------------------------------------------------- |
| 38   | `SlashNotFound`               | No slash record found for this escrow.  | Slash operation called when no record exists.             |
| 39   | `SlashAlreadyDisputed`        | This slash has already been disputed.   | Dispute raised against a slash that was already disputed. |
| 40   | `SlashDisputeDeadlineExpired` | The slash dispute window has closed.    | Dispute raised after the slash dispute deadline.          |
| 41   | `InvalidSlashAmount`          | Slash amount must be greater than zero. | Slash amount is zero or negative.                         |

---

## Storage Migration (42)

| Code | Name                     | User-facing description   | When it occurs                                              |
| ---- | ------------------------ | ------------------------- | ----------------------------------------------------------- |
| 42   | `StorageMigrationFailed` | Storage migration failed. | An error occurred during a contract storage schema upgrade. |

---

## Recurring Payments (43–47)

| Code | Name                         | User-facing description                              | When it occurs                                                                                                          |
| ---- | ---------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 43   | `RecurringConfigNotFound`    | No recurring payment schedule found for this escrow. | `process_recurring_payments` or schedule management called on a non-recurring escrow.                                   |
| 44   | `InvalidRecurringSchedule`   | Recurring schedule parameters are invalid.           | `start_time` is in the past, both `end_date` and `number_of_payments` are absent, or `total_payments` resolves to zero. |
| 45   | `NoRecurringPaymentDue`      | No payment is due yet.                               | `now < next_payment_at` or `payments_remaining == 0`.                                                                   |
| 46   | `RecurringSchedulePaused`    | The recurring schedule is paused.                    | `process_recurring_payments` called while `paused == true`. Call `resume_recurring_schedule` first.                     |
| 47   | `RecurringScheduleCancelled` | The recurring schedule has been cancelled.           | Any recurring operation called after `cancel_recurring_schedule`.                                                       |

---

## Oracle (48–50)

| Code | Name                  | User-facing description           | When it occurs                                                          |
| ---- | --------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| 48   | `OracleNotConfigured` | No price oracle is configured.    | Oracle-dependent function called before an oracle address was set.      |
| 49   | `OraclePriceStale`    | Oracle price data is too old.     | Price feed has not been updated within the acceptable staleness window. |
| 50   | `OracleInvalidPrice`  | Oracle returned an invalid price. | Oracle price is zero or negative.                                       |

---

## Timelock (51–53)

| Code | Name                      | User-facing description                      | When it occurs                                              |
| ---- | ------------------------- | -------------------------------------------- | ----------------------------------------------------------- |
| 51   | `InvalidTimelockDuration` | Timelock duration is invalid.                | Duration is zero or otherwise out of range.                 |
| 52   | `TimelockAlreadyActive`   | A timelock is already active on this escrow. | `start_timelock` called when a timelock is already running. |
| 53   | `TimelockNotExpired`      | The timelock has not yet expired.            | Release attempted before the timelock duration has elapsed. |

---

## Bridge / Cross-Chain (54)

| Code | Name          | User-facing description              | When it occurs                                                                                    |
| ---- | ------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| 54   | `BridgeError` | Cross-chain bridge operation failed. | Wrapped token not approved, Wormhole transfer not found, or bridge finalization not yet complete. |
