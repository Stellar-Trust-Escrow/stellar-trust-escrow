# Recurring Payments

This guide documents the `RecurringPaymentConfig` struct, the three `RecurringInterval` variants, how `process_recurring_payments` handles multiple overdue periods, and the pause/resume/cancel workflow.

---

## `RecurringInterval` (`types.rs` L111–115)

| Variant   | Seconds   | Notes                                                           |
| --------- | --------- | --------------------------------------------------------------- |
| `Daily`   | 86,400    | Exactly 24 hours                                                |
| `Weekly`  | 604,800   | 7 × 86,400                                                      |
| `Monthly` | 2,592,000 | 30 × 86,400 — a fixed 30-day approximation, not calendar months |

`next_schedule_time` (`lib.rs` L2642) adds the interval's second offset to the current `next_payment_at` using saturating arithmetic:

```rust
fn next_schedule_time(current: u64, interval: &RecurringInterval) -> Result<u64, EscrowError> {
    let seconds = match interval {
        RecurringInterval::Daily   =>        86_400_u64,
        RecurringInterval::Weekly  =>   7 * 86_400_u64,
        RecurringInterval::Monthly =>  30 * 86_400_u64,
    };
    current.checked_add(seconds).ok_or(EscrowError::InvalidRecurringSchedule)
}
```

---

## `RecurringPaymentConfig` Field Reference (`types.rs` L181–217)

| Field                | Type                | Description                                                                                                                                    |
| -------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `interval`           | `RecurringInterval` | Cadence between payments (Daily / Weekly / Monthly).                                                                                           |
| `payment_amount`     | `i128`              | Token amount (in base units / stroops) released each period.                                                                                   |
| `start_time`         | `u64`               | Ledger timestamp of the first scheduled payment. Must be in the future at creation time.                                                       |
| `next_payment_at`    | `u64`               | Ledger timestamp when the next payment becomes due. Updated after each processed payment. Set to `0` when no payments remain.                  |
| `end_date`           | `Option<u64>`       | Optional hard stop. If `next_payment_at` would advance past `end_date`, the schedule terminates early.                                         |
| `total_payments`     | `u32`               | Total number of payments the schedule was created with. Immutable after creation.                                                              |
| `payments_remaining` | `u32`               | Payments not yet released. Decremented by one per processed payment. Reaches `0` when the schedule is exhausted.                               |
| `processed_payments` | `u32`               | Payments already released. Incremented by one per processed payment. `processed_payments + payments_remaining == total_payments` at all times. |
| `paused`             | `bool`              | `true` while the schedule is paused. `process_recurring_payments` returns `RecurringSchedulePaused` (46) when set.                             |
| `cancelled`          | `bool`              | `true` after the schedule is cancelled. Immutable once set. `process_recurring_payments` returns `RecurringScheduleCancelled` (47) when set.   |
| `paused_at`          | `Option<u64>`       | Ledger timestamp when the schedule was paused. `None` if never paused or after resume. Used to calculate how long the schedule was suspended.  |
| `last_payment_at`    | `Option<u64>`       | Ledger timestamp of the most recently processed payment. `None` before the first payment.                                                      |

---

## Creating a Recurring Escrow

`create_recurring_escrow` (`lib.rs` L984) accepts either an explicit `number_of_payments` or an `end_date` (or both). The contract derives `total_payments` from whichever bound is tighter. Both `None` is rejected with `InvalidRecurringSchedule` (44).

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source <CLIENT_SECRET_KEY> \
  --network testnet \
  -- \
  create_recurring_escrow \
  --client  GCLIENT... \
  --freelancer GFREELANCER... \
  --token GTOKEN... \
  --payment_amount 100000000 \
  --interval '"Weekly"' \
  --start_time 1800000000 \
  --end_date null \
  --number_of_payments 12 \
  --brief_hash <32-byte-hex>
```

The contract transfers `payment_amount × total_payments` tokens from the client upfront and locks them in the escrow.

---

## Multi-Period Processing

`process_recurring_payments` (`lib.rs` L1433) releases **all overdue periods in a single call** using a `while` loop:

```
while payments_remaining > 0 && now >= next_payment_at:
    create milestone, transfer payment_amount to freelancer
    processed_payments += 1
    payments_remaining -= 1
    last_payment_at = now
    if payments_remaining == 0: next_payment_at = 0; break
    next_payment_at = next_schedule_time(next_payment_at, interval)
    if end_date set and next_payment_at > end_date: break
```

If a caller misses several periods (e.g., three weekly payments), a single invocation catches up all three and emits one `rec_pay` event with `processed_count = 3` and the cumulative `total_released`.

The function returns `NoRecurringPaymentDue` (45) if `now < next_payment_at` or `payments_remaining == 0`.

### Termination conditions

The loop exits when **either** condition is met first:

1. `payments_remaining` reaches `0` (count-based termination).
2. The next computed `next_payment_at` would exceed `end_date` (date-based termination).

---

## Pause / Resume / Cancel Workflow

### Pause

Calling `pause_recurring_schedule` sets `paused = true` and records `paused_at = now`. Any call to `process_recurring_payments` while paused returns `RecurringSchedulePaused` (46). Missed periods during the pause are **not** back-filled on resume — `next_payment_at` is recalculated from the resume timestamp.

### Resume

Calling `resume_recurring_schedule` clears `paused = false`, clears `paused_at = None`, and advances `next_payment_at` to `now + interval_seconds`. The `rec_res` event carries the new `next_payment_at`.

### Cancel

Calling `cancel_recurring_schedule` sets `cancelled = true` and refunds the remaining locked balance (`payments_remaining × payment_amount`) to the client. The `rec_can` event carries the refunded amount. Cancellation is irreversible.

---

## Error Reference

| Code | Name                         | When it occurs                                                                                                        |
| ---- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 43   | `RecurringConfigNotFound`    | No recurring config exists for the given `escrow_id`                                                                  |
| 44   | `InvalidRecurringSchedule`   | `start_time` is in the past, both `end_date` and `number_of_payments` are `None`, or `total_payments` resolves to `0` |
| 45   | `NoRecurringPaymentDue`      | `now < next_payment_at` or `payments_remaining == 0`                                                                  |
| 46   | `RecurringSchedulePaused`    | Schedule is paused; call `resume_recurring_schedule` first                                                            |
| 47   | `RecurringScheduleCancelled` | Schedule was cancelled; no further payments can be processed                                                          |
