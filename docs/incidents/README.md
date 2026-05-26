# Incident Response — StellarTrustEscrow

This directory contains everything needed to respond to, track, and learn from incidents.

## Contents

| File | Purpose |
|------|---------|
| `runbooks/sev1-critical-outage.md` | SEV1 response steps |
| `runbooks/sev2-high-impact.md` | SEV2 response steps |
| `runbooks/sev3-degraded-performance.md` | SEV3 response steps |
| `runbooks/sev4-low-impact.md` | SEV4 response steps |
| `runbooks/database-outage.md` | DB-specific runbook |
| `runbooks/smart-contract-exploit.md` | Security incident runbook |
| `templates/post-mortem.md` | Post-mortem template |
| `templates/status-page-update.md` | User-facing communication template |
| `templates/internal-comms.md` | Internal Slack/email templates |
| `on-call-guide.md` | On-call rotation setup and expectations |

## Severity Definitions

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|---------|
| SEV1 | Full outage, data loss risk, security breach | Immediate (< 5 min) | API down, DB unreachable, funds at risk |
| SEV2 | Major feature broken, significant user impact | < 15 min | Escrow creation failing, payments broken |
| SEV3 | Degraded performance, partial failure | < 1 hour | Slow queries, cache miss storm, indexer lag |
| SEV4 | Minor issue, no user impact | Next business day | UI glitch, non-critical log noise |

## Incident Lifecycle

```
OPEN → ACKNOWLEDGED → INVESTIGATING → MITIGATED → RESOLVED → POST_MORTEM → CLOSED
```

## API

The incident system exposes a REST API (admin-auth required):

```
POST   /api/incidents                    Create incident
GET    /api/incidents                    List incidents (?status=open&severity=SEV1)
GET    /api/incidents/:id                Get incident detail
PATCH  /api/incidents/:id/status         Transition status
POST   /api/incidents/:id/post-mortem    Attach post-mortem
GET    /api/incidents/oncall             Current on-call engineer
```

## Alerting

Configure these environment variables to enable alerting:

```
PAGERDUTY_ROUTING_KEY   PagerDuty Events API v2 integration key
SLACK_INCIDENT_WEBHOOK  Slack incoming webhook URL
ONCALL_SCHEDULE         JSON array of on-call rotation entries
RUNBOOK_BASE_URL        Base URL for runbook links in alerts
```
