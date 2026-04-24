# On-Call Guide — StellarTrustEscrow

## Rotation Setup

On-call is configured via the `ONCALL_SCHEDULE` environment variable — a JSON array of weekly shifts:

```json
[
  {
    "name": "Alice Smith",
    "email": "alice@example.com",
    "phone": "+1-555-0100",
    "startUtc": "2026-01-05T00:00:00Z",
    "endUtc":   "2026-01-12T00:00:00Z"
  },
  {
    "name": "Bob Jones",
    "email": "bob@example.com",
    "phone": "+1-555-0101",
    "startUtc": "2026-01-12T00:00:00Z",
    "endUtc":   "2026-01-19T00:00:00Z"
  }
]
```

The current on-call engineer is returned by `GET /api/incidents/oncall`.

## Expectations

- Acknowledge SEV1/SEV2 pages within **5 minutes**.
- Acknowledge SEV3 pages within **30 minutes** during business hours.
- SEV4 issues can be handled next business day.
- If you cannot respond, immediately hand off to the next person on the schedule.

## Before Your Shift

1. Confirm PagerDuty notifications are enabled on your phone.
2. Review any open incidents from the previous shift.
3. Check the `#incidents` Slack channel for context.
4. Verify you have access to: AWS console, Heroku/Render dashboard, Vault, DB.

## During an Incident

1. Acknowledge the alert in PagerDuty within 5 minutes.
2. Create an incident via the API or Slack bot:
   ```
   POST /api/incidents
   { "title": "...", "description": "...", "severity": "SEV2", "affectedServices": ["api"] }
   ```
3. Post an initial update in `#incidents` within 10 minutes.
4. Follow the appropriate runbook.
5. Update incident status as you progress.
6. Resolve and schedule a post-mortem for SEV1/SEV2.

## Escalation

| Situation | Escalate to |
|-----------|-------------|
| No response after 10 min | Secondary on-call |
| SEV1 lasting > 30 min | Engineering lead |
| Security breach | Security lead + CTO immediately |
| Data loss suspected | CTO + Legal immediately |

## After Your Shift

- Ensure all incidents are resolved or handed off.
- Complete any pending post-mortems.
- Update the runbooks if you found gaps.
