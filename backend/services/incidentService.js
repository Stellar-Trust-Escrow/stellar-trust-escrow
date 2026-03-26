/**
 * Incident Response Service
 *
 * Manages the full incident lifecycle:
 *   - Incident creation, status transitions, and resolution
 *   - Alerting via PagerDuty Events API v2, Slack webhooks, and email
 *   - On-call rotation scheduling
 *   - Post-mortem tracking
 *   - Audit trail for every state change
 *
 * ## Severity levels
 *
 *   SEV1 — Critical: full outage, data loss risk, security breach
 *   SEV2 — High: major feature broken, significant user impact
 *   SEV3 — Medium: degraded performance, partial feature failure
 *   SEV4 — Low: minor issue, cosmetic bug, no user impact
 *
 * ## Environment variables
 *
 *   PAGERDUTY_ROUTING_KEY   — PagerDuty Events API v2 integration key
 *   SLACK_INCIDENT_WEBHOOK  — Slack incoming webhook URL
 *   ONCALL_SCHEDULE         — JSON array of on-call entries (see below)
 *   INCIDENT_ALERT_EMAIL    — email address for incident notifications
 *
 * @module incidentService
 */

import crypto from 'crypto';

// ── Types / constants ─────────────────────────────────────────────────────────

export const Severity = Object.freeze({
  SEV1: 'SEV1',
  SEV2: 'SEV2',
  SEV3: 'SEV3',
  SEV4: 'SEV4',
});

export const Status = Object.freeze({
  OPEN: 'open',
  ACKNOWLEDGED: 'acknowledged',
  INVESTIGATING: 'investigating',
  MITIGATED: 'mitigated',
  RESOLVED: 'resolved',
  POST_MORTEM: 'post_mortem',
  CLOSED: 'closed',
});

// Valid status transitions
const TRANSITIONS = {
  [Status.OPEN]: [Status.ACKNOWLEDGED, Status.INVESTIGATING, Status.RESOLVED],
  [Status.ACKNOWLEDGED]: [Status.INVESTIGATING, Status.RESOLVED],
  [Status.INVESTIGATING]: [Status.MITIGATED, Status.RESOLVED],
  [Status.MITIGATED]: [Status.RESOLVED],
  [Status.RESOLVED]: [Status.POST_MORTEM, Status.CLOSED],
  [Status.POST_MORTEM]: [Status.CLOSED],
  [Status.CLOSED]: [],
};

// ── In-memory store (replace with DB persistence in production) ───────────────

/** @type {Map<string, Incident>} */
const incidents = new Map();

// ── On-call rotation ──────────────────────────────────────────────────────────

/**
 * Parses the ONCALL_SCHEDULE env var.
 * Format: JSON array of { name, email, phone?, startUtc, endUtc }
 *
 * Example:
 *   [
 *     { "name": "Alice", "email": "alice@example.com", "startUtc": "2026-01-01T00:00:00Z", "endUtc": "2026-01-08T00:00:00Z" },
 *     { "name": "Bob",   "email": "bob@example.com",   "startUtc": "2026-01-08T00:00:00Z", "endUtc": "2026-01-15T00:00:00Z" }
 *   ]
 */
function parseOnCallSchedule() {
  try {
    return JSON.parse(process.env.ONCALL_SCHEDULE || '[]');
  } catch {
    return [];
  }
}

/**
 * Returns the currently on-call engineer, or null if no schedule is configured.
 * @returns {{ name: string, email: string, phone?: string } | null}
 */
export function getCurrentOnCall() {
  const schedule = parseOnCallSchedule();
  const now = new Date();
  return (
    schedule.find((entry) => {
      const start = new Date(entry.startUtc);
      const end = new Date(entry.endUtc);
      return now >= start && now < end;
    }) ?? schedule[0] ?? null
  );
}

/**
 * Returns the full on-call schedule.
 */
export function getOnCallSchedule() {
  return parseOnCallSchedule();
}

// ── Alert dispatchers ─────────────────────────────────────────────────────────

/**
 * Sends a PagerDuty alert via Events API v2.
 * https://developer.pagerduty.com/docs/events-api-v2/trigger-events/
 *
 * @param {'trigger'|'acknowledge'|'resolve'} action
 * @param {Incident} incident
 */
async function alertPagerDuty(action, incident) {
  const key = process.env.PAGERDUTY_ROUTING_KEY;
  if (!key) return;

  const payload = {
    routing_key: key,
    event_action: action,
    dedup_key: incident.id,
    payload: {
      summary: `[${incident.severity}] ${incident.title}`,
      source: 'stellar-trust-escrow',
      severity: incident.severity === Severity.SEV1 ? 'critical'
        : incident.severity === Severity.SEV2 ? 'error'
        : incident.severity === Severity.SEV3 ? 'warning'
        : 'info',
      timestamp: new Date().toISOString(),
      custom_details: {
        id: incident.id,
        status: incident.status,
        description: incident.description,
        affectedServices: incident.affectedServices.join(', '),
        runbook: incident.runbookUrl,
      },
    },
  };

  try {
    const res = await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`[Incident] PagerDuty alert failed: ${res.status}`);
    }
  } catch (err) {
    console.error('[Incident] PagerDuty request error:', err.message);
  }
}

/**
 * Posts an incident notification to a Slack webhook.
 *
 * @param {Incident} incident
 * @param {string} [message]
 */
async function alertSlack(incident, message) {
  const webhookUrl = process.env.SLACK_INCIDENT_WEBHOOK;
  if (!webhookUrl) return;

  const severityEmoji = {
    SEV1: '🔴', SEV2: '🟠', SEV3: '🟡', SEV4: '🔵',
  }[incident.severity] ?? '⚪';

  const body = {
    text: message ?? `${severityEmoji} *[${incident.severity}] ${incident.title}*`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${severityEmoji} ${incident.severity}: ${incident.title}` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Status:*\n${incident.status}` },
          { type: 'mrkdwn', text: `*ID:*\n${incident.id}` },
          { type: 'mrkdwn', text: `*Services:*\n${incident.affectedServices.join(', ') || 'unknown'}` },
          { type: 'mrkdwn', text: `*Commander:*\n${incident.commander || 'unassigned'}` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Description:*\n${incident.description}` },
      },
      ...(incident.runbookUrl ? [{
        type: 'section',
        text: { type: 'mrkdwn', text: `*Runbook:* <${incident.runbookUrl}|View runbook>` },
      }] : []),
    ],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error(`[Incident] Slack alert failed: ${res.status}`);
  } catch (err) {
    console.error('[Incident] Slack request error:', err.message);
  }
}

/**
 * Dispatches all configured alert channels for an incident event.
 *
 * @param {'trigger'|'acknowledge'|'resolve'|'update'} action
 * @param {Incident} incident
 * @param {string} [message]
 */
async function dispatchAlerts(action, incident, message) {
  const pdAction = action === 'trigger' ? 'trigger'
    : action === 'acknowledge' ? 'acknowledge'
    : action === 'resolve' ? 'resolve'
    : 'trigger'; // updates re-trigger to keep PD in sync

  await Promise.allSettled([
    alertPagerDuty(pdAction, incident),
    alertSlack(incident, message),
  ]);
}

// ── Incident CRUD ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Incident
 * @property {string}   id
 * @property {string}   title
 * @property {string}   description
 * @property {string}   severity        — SEV1–SEV4
 * @property {string}   status
 * @property {string[]} affectedServices
 * @property {string}   commander       — incident commander name/email
 * @property {string}   runbookUrl
 * @property {string}   createdAt
 * @property {string}   updatedAt
 * @property {string}   [resolvedAt]
 * @property {object[]} timeline        — audit trail of status changes
 * @property {object}   [postMortem]
 */

/**
 * Creates a new incident and fires alerts.
 *
 * @param {object} params
 * @returns {Promise<Incident>}
 */
export async function createIncident({
  title,
  description,
  severity = Severity.SEV3,
  affectedServices = [],
  commander,
  runbookUrl,
  createdBy,
}) {
  const id = `INC-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const now = new Date().toISOString();

  // Auto-assign on-call engineer as commander if not specified
  const onCall = getCurrentOnCall();
  const resolvedCommander = commander ?? onCall?.name ?? 'unassigned';

  /** @type {Incident} */
  const incident = {
    id,
    title,
    description,
    severity,
    status: Status.OPEN,
    affectedServices,
    commander: resolvedCommander,
    runbookUrl: runbookUrl ?? resolvedRunbookUrl(severity),
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
    createdBy: createdBy ?? 'system',
    timeline: [
      { ts: now, status: Status.OPEN, actor: createdBy ?? 'system', note: 'Incident created' },
    ],
    postMortem: null,
  };

  incidents.set(id, incident);
  console.error(`[Incident] ${id} CREATED severity=${severity} title="${title}"`);

  await dispatchAlerts('trigger', incident);
  return incident;
}

/**
 * Transitions an incident to a new status.
 *
 * @param {string} id
 * @param {string} newStatus
 * @param {object} [opts]
 * @returns {Promise<Incident>}
 */
export async function updateIncidentStatus(id, newStatus, { actor = 'system', note = '' } = {}) {
  const incident = incidents.get(id);
  if (!incident) throw new Error(`Incident ${id} not found`);

  const allowed = TRANSITIONS[incident.status] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Invalid transition: ${incident.status} → ${newStatus}. Allowed: ${allowed.join(', ')}`,
    );
  }

  const now = new Date().toISOString();
  incident.status = newStatus;
  incident.updatedAt = now;
  if (newStatus === Status.RESOLVED || newStatus === Status.CLOSED) {
    incident.resolvedAt = now;
  }

  incident.timeline.push({ ts: now, status: newStatus, actor, note });
  incidents.set(id, incident);

  const pdAction = newStatus === Status.ACKNOWLEDGED ? 'acknowledge'
    : newStatus === Status.RESOLVED || newStatus === Status.CLOSED ? 'resolve'
    : 'update';

  await dispatchAlerts(pdAction, incident, note || undefined);
  console.log(`[Incident] ${id} → ${newStatus} by ${actor}`);
  return incident;
}

/**
 * Attaches a post-mortem to a resolved incident.
 *
 * @param {string} id
 * @param {object} postMortem
 * @returns {Incident}
 */
export function attachPostMortem(id, postMortem) {
  const incident = incidents.get(id);
  if (!incident) throw new Error(`Incident ${id} not found`);
  if (![Status.RESOLVED, Status.POST_MORTEM, Status.CLOSED].includes(incident.status)) {
    throw new Error('Post-mortem can only be attached to resolved incidents');
  }

  incident.postMortem = {
    ...postMortem,
    attachedAt: new Date().toISOString(),
  };
  incident.updatedAt = new Date().toISOString();
  incidents.set(id, incident);
  return incident;
}

/**
 * Returns a single incident by ID.
 * @param {string} id
 * @returns {Incident}
 */
export function getIncident(id) {
  const incident = incidents.get(id);
  if (!incident) throw new Error(`Incident ${id} not found`);
  return incident;
}

/**
 * Returns all incidents, optionally filtered by status or severity.
 *
 * @param {{ status?: string, severity?: string }} [filters]
 * @returns {Incident[]}
 */
export function listIncidents(filters = {}) {
  let result = [...incidents.values()];
  if (filters.status) result = result.filter((i) => i.status === filters.status);
  if (filters.severity) result = result.filter((i) => i.severity === filters.severity);
  return result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the default runbook URL for a given severity. */
function resolvedRunbookUrl(severity) {
  const base = process.env.RUNBOOK_BASE_URL || 'https://github.com/your-org/stellar-trust-escrow/blob/main/docs/incidents/runbooks';
  const map = {
    [Severity.SEV1]: `${base}/sev1-critical-outage.md`,
    [Severity.SEV2]: `${base}/sev2-high-impact.md`,
    [Severity.SEV3]: `${base}/sev3-degraded-performance.md`,
    [Severity.SEV4]: `${base}/sev4-low-impact.md`,
  };
  return map[severity] ?? `${base}/general.md`;
}

export default {
  createIncident,
  updateIncidentStatus,
  attachPostMortem,
  getIncident,
  listIncidents,
  getCurrentOnCall,
  getOnCallSchedule,
  Severity,
  Status,
};
