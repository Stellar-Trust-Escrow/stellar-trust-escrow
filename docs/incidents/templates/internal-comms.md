# Internal Communication Templates

Templates for `#incidents` Slack channel and internal email during an incident.

---

## Slack: Incident Declared

```
🔴 *INCIDENT DECLARED — [SEV1/SEV2/SEV3]*

*Title:* [Incident title]
*ID:* INC-XXXXXXXX
*Commander:* @[name]
*Status:* Investigating
*Affected:* [services/features]

*What we know:* [1-2 sentences]
*Runbook:* [link]
*Bridge:* #incident-YYYY-MM-DD

Next update in 30 minutes or when status changes.
```

---

## Slack: Status Update

```
📋 *INCIDENT UPDATE — INC-XXXXXXXX* ([SEV])

*Status:* [Investigating → Mitigated → Resolved]
*Time:* HH:MM UTC

*Update:* [What changed, what was found, what was done]

*Next steps:* [What happens next]
*ETA:* [If known]
```

---

## Slack: Resolved

```
✅ *INCIDENT RESOLVED — INC-XXXXXXXX*

*Duration:* Xh Ym
*Root cause:* [1 sentence]
*Fix:* [1 sentence]

Post-mortem will be scheduled within 48 hours.
Thanks to @[names] for the fast response.
```

---

## Email: Stakeholder Notification (SEV1/SEV2)

**Subject:** [ACTION REQUIRED / FYI] Incident INC-XXXXXXXX — [Title]

Hi [Name],

We are currently experiencing [brief description] affecting [scope].

**Current status:** [Investigating / Mitigated]  
**Impact:** [Who is affected and how]  
**ETA for resolution:** [If known, otherwise "We will update you in 30 minutes"]

Our engineering team is actively working on this. I will send another update at [time] or when the situation changes.

[Your name]  
Incident Commander

---

## Email: Resolution Notification

**Subject:** RESOLVED — Incident INC-XXXXXXXX — [Title]

Hi [Name],

The incident affecting [brief description] has been resolved as of [HH:MM UTC].

**Duration:** Xh Ym  
**Root cause:** [1-2 sentences, non-technical]  
**What we did:** [1-2 sentences]  
**Prevention:** [What we're doing to prevent recurrence]

A full post-mortem will be available within 5 business days at [link].

We apologise for the disruption and appreciate your patience.

[Your name]
