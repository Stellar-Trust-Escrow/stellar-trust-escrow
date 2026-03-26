# Post-Mortem: [Incident Title]

**Incident ID:** INC-XXXXXXXX  
**Date:** YYYY-MM-DD  
**Severity:** SEV[1-4]  
**Duration:** Xh Ym (HH:MM UTC — HH:MM UTC)  
**Author(s):**  
**Reviewers:**  
**Status:** Draft | In Review | Final  

---

## Summary

_One paragraph describing what happened, the impact, and how it was resolved._

---

## Impact

| Metric | Value |
|--------|-------|
| User-facing downtime | X minutes |
| Affected users (estimated) | X |
| Affected escrows | X |
| Revenue impact | $X |
| Data loss | None / Partial / Full |

---

## Timeline

All times in UTC.

| Time | Event |
|------|-------|
| HH:MM | First alert fired |
| HH:MM | On-call acknowledged |
| HH:MM | Root cause identified |
| HH:MM | Mitigation applied |
| HH:MM | Service restored |
| HH:MM | Incident resolved |

---

## Root Cause

_Describe the technical root cause in detail. Be specific — "database was slow" is not enough; "a missing index on `escrows.status` caused a full table scan on every list request" is._

---

## Contributing Factors

- Factor 1
- Factor 2

---

## What Went Well

- We detected the issue within X minutes via Sentry/PagerDuty
- The runbook covered this scenario
- Communication was clear and timely

---

## What Went Poorly

- Alert threshold was too high — we should have been paged sooner
- Runbook step X was outdated
- We didn't have a staging environment to test the fix

---

## Action Items

| Action | Owner | Due Date | Priority |
|--------|-------|----------|----------|
| Add index on `escrows.status` | @alice | 2026-02-01 | High |
| Update SEV2 runbook with new RPC endpoint | @bob | 2026-02-03 | Medium |
| Add alert for DB connection pool > 80% | @alice | 2026-02-05 | High |
| Write integration test for this failure mode | @carol | 2026-02-10 | Medium |

---

## Lessons Learned

_What would you do differently next time? What systemic changes would prevent this class of incident?_

---

## Appendix

### Relevant Logs

```
[paste relevant log snippets here]
```

### Metrics

_Link to Grafana/Datadog dashboard snapshot showing the incident window._

### Sentry Issues

_Link to Sentry issue(s) created during the incident._
