import prisma from '../lib/prisma.js';
import auditService, { AuditAction, AuditCategory } from './auditService.js';

const REPORT_TYPES = {
  TRANSACTIONS: 'transactions',
  USERS: 'users',
  ACTIVITY: 'activity',
};

const EXPORT_FORMATS = {
  JSON: 'json',
  CSV: 'csv',
  PDF: 'pdf',
};

const SCHEDULE_FREQUENCIES = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
};

const scheduleState = {
  definitions: [],
  history: [],
  nextId: 1,
  timer: null,
};

const MAX_AUDIT_ROWS = 250;

function now() {
  return new Date();
}

function toIso(value) {
  return value ? new Date(value).toISOString() : null;
}

function normaliseDateRange({ from, to } = {}) {
  const range = {};
  if (from) range.gte = new Date(from);
  if (to) range.lte = new Date(to);
  return Object.keys(range).length ? range : undefined;
}

function buildScheduleNextRun(frequency, base = now()) {
  const nextRun = new Date(base);
  if (frequency === SCHEDULE_FREQUENCIES.DAILY) nextRun.setUTCDate(nextRun.getUTCDate() + 1);
  if (frequency === SCHEDULE_FREQUENCIES.WEEKLY) nextRun.setUTCDate(nextRun.getUTCDate() + 7);
  if (frequency === SCHEDULE_FREQUENCIES.MONTHLY) nextRun.setUTCMonth(nextRun.getUTCMonth() + 1);
  return nextRun;
}

function ensureValidReportType(type) {
  if (!Object.values(REPORT_TYPES).includes(type)) {
    throw new Error(`Unsupported report type: ${type}`);
  }
}

function ensureValidExportFormat(format) {
  if (!Object.values(EXPORT_FORMATS).includes(format)) {
    throw new Error(`Unsupported export format: ${format}`);
  }
}

function ensureValidFrequency(frequency) {
  if (!Object.values(SCHEDULE_FREQUENCIES).includes(frequency)) {
    throw new Error(`Unsupported schedule frequency: ${frequency}`);
  }
}

async function fetchAuditTrail(filters = {}) {
  const result = await auditService.search({
    from: filters.from,
    to: filters.to,
    category: filters.category,
    action: filters.action,
    actor: filters.actor,
    resourceId: filters.resourceId,
    page: 1,
    limit: MAX_AUDIT_ROWS,
  });

  return {
    total: result.total,
    rows: result.data.map((row) => ({
      id: row.id.toString(),
      category: row.category,
      action: row.action,
      actor: row.actor,
      resourceId: row.resourceId,
      statusCode: row.statusCode,
      ipAddress: row.ipAddress,
      createdAt: row.createdAt.toISOString(),
      metadata: row.metadata ?? null,
    })),
  };
}

async function buildTransactionReport(filters = {}) {
  const createdAt = normaliseDateRange(filters);
  const paymentWhere = {};
  const escrowWhere = {};
  const eventWhere = {};

  if (createdAt) {
    paymentWhere.createdAt = createdAt;
    escrowWhere.createdAt = createdAt;
    eventWhere.ledgerAt = createdAt;
  }
  if (filters.status) {
    paymentWhere.status = filters.status;
    escrowWhere.status = filters.status;
  }
  if (filters.address) {
    paymentWhere.address = filters.address;
    escrowWhere.OR = [
      { clientAddress: filters.address },
      { freelancerAddress: filters.address },
      { arbiterAddress: filters.address },
    ];
  }

  const [payments, escrows, events, auditTrail] = await Promise.all([
    prisma.payment.findMany({
      where: paymentWhere,
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
    prisma.escrow.findMany({
      where: escrowWhere,
      include: { milestones: true, dispute: true },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
    prisma.contractEvent.findMany({
      where: eventWhere,
      orderBy: { ledgerAt: 'desc' },
      take: 1000,
    }),
    fetchAuditTrail({
      from: filters.from,
      to: filters.to,
      category: AuditCategory.PAYMENT,
    }),
  ]);

  return {
    type: REPORT_TYPES.TRANSACTIONS,
    generatedAt: now().toISOString(),
    filters,
    summary: {
      payments: payments.length,
      escrows: escrows.length,
      events: events.length,
      totalFiatVolume: payments.reduce((sum, payment) => sum + (payment.amountFiat ?? 0), 0),
      totalEscrowVolume: escrows.reduce(
        (sum, escrow) => sum + Number.parseFloat(escrow.totalAmount || '0'),
        0,
      ),
    },
    transactions: payments.map((payment) => ({
      id: payment.id,
      address: payment.address,
      escrowId: payment.escrowId?.toString() ?? null,
      amountFiat: payment.amountFiat,
      amountCrypto: payment.amountCrypto,
      currency: payment.currency,
      status: payment.status,
      createdAt: toIso(payment.createdAt),
      updatedAt: toIso(payment.updatedAt),
    })),
    escrows: escrows.map((escrow) => ({
      id: escrow.id.toString(),
      clientAddress: escrow.clientAddress,
      freelancerAddress: escrow.freelancerAddress,
      tokenAddress: escrow.tokenAddress,
      totalAmount: escrow.totalAmount,
      remainingBalance: escrow.remainingBalance,
      status: escrow.status,
      milestoneCount: escrow.milestones.length,
      dispute: escrow.dispute
        ? {
            id: escrow.dispute.id,
            raisedByAddress: escrow.dispute.raisedByAddress,
            raisedAt: toIso(escrow.dispute.raisedAt),
            resolvedAt: toIso(escrow.dispute.resolvedAt),
          }
        : null,
      createdAt: toIso(escrow.createdAt),
    })),
    ledgerActivity: events.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      escrowId: event.escrowId?.toString() ?? null,
      txHash: event.txHash,
      ledger: event.ledger.toString(),
      ledgerAt: toIso(event.ledgerAt),
    })),
    auditTrail,
  };
}

async function buildUserReport(filters = {}) {
  const createdAt = normaliseDateRange(filters);
  const userWhere = {};
  const kycWhere = {};
  const profileWhere = {};

  if (createdAt) {
    userWhere.createdAt = createdAt;
    kycWhere.createdAt = createdAt;
    profileWhere.createdAt = createdAt;
  }
  if (filters.email) userWhere.email = { contains: filters.email, mode: 'insensitive' };
  if (filters.address) {
    kycWhere.address = filters.address;
    profileWhere.address = filters.address;
  }
  if (filters.kycStatus) kycWhere.status = filters.kycStatus;

  const [users, kycRecords, profiles, reputations, auditTrail] = await Promise.all([
    prisma.user.findMany({
      where: userWhere,
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
    prisma.kycVerification.findMany({
      where: kycWhere,
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
    prisma.userProfile.findMany({
      where: profileWhere,
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
    prisma.reputationRecord.findMany({
      take: 1000,
      orderBy: { updatedAt: 'desc' },
    }),
    fetchAuditTrail({
      from: filters.from,
      to: filters.to,
      category: AuditCategory.KYC,
    }),
  ]);

  const kycByAddress = new Map(kycRecords.map((record) => [record.address, record]));
  const profileByAddress = new Map(profiles.map((profile) => [profile.address, profile]));
  const reputationByAddress = new Map(reputations.map((record) => [record.address, record]));

  return {
    type: REPORT_TYPES.USERS,
    generatedAt: now().toISOString(),
    filters,
    summary: {
      users: users.length,
      kycRecords: kycRecords.length,
      approvedKyc: kycRecords.filter((record) => record.status === 'Approved').length,
      declinedKyc: kycRecords.filter((record) => record.status === 'Declined').length,
      profiles: profiles.length,
    },
    users: users.map((user) => {
      const profile = profileByAddress.get(filters.address) ?? null;
      const kyc = filters.address ? kycByAddress.get(filters.address) ?? null : null;
      const reputation = filters.address ? reputationByAddress.get(filters.address) ?? null : null;
      return {
        id: user.id,
        email: user.email,
        createdAt: toIso(user.createdAt),
        updatedAt: toIso(user.updatedAt),
        profile: profile
          ? {
              address: profile.address,
              displayName: profile.displayName,
              createdAt: toIso(profile.createdAt),
            }
          : null,
        kyc: kyc
          ? {
              address: kyc.address,
              status: kyc.status,
              reviewResult: kyc.reviewResult,
              updatedAt: toIso(kyc.updatedAt),
            }
          : null,
        reputation: reputation
          ? {
              address: reputation.address,
              totalScore: reputation.totalScore.toString(),
              completedEscrows: reputation.completedEscrows,
              disputedEscrows: reputation.disputedEscrows,
            }
          : null,
      };
    }),
    kycRecords: kycRecords.map((record) => ({
      address: record.address,
      status: record.status,
      reviewResult: record.reviewResult,
      rejectLabels: record.rejectLabels,
      createdAt: toIso(record.createdAt),
      updatedAt: toIso(record.updatedAt),
    })),
    profiles: profiles.map((profile) => ({
      address: profile.address,
      displayName: profile.displayName,
      createdAt: toIso(profile.createdAt),
      updatedAt: toIso(profile.updatedAt),
    })),
    auditTrail,
  };
}

async function buildActivityReport(filters = {}) {
  const createdAt = normaliseDateRange(filters);
  const auditWhere = {};
  const eventWhere = {};

  if (createdAt) {
    auditWhere.createdAt = createdAt;
    eventWhere.ledgerAt = createdAt;
  }
  if (filters.actor) auditWhere.actor = { contains: filters.actor, mode: 'insensitive' };
  if (filters.category) auditWhere.category = filters.category;
  if (filters.eventType) eventWhere.eventType = filters.eventType;

  const [auditLogs, contractEvents, adminAuditLogs, auditTrail] = await Promise.all([
    prisma.auditLog.findMany({
      where: auditWhere,
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
    prisma.contractEvent.findMany({
      where: eventWhere,
      orderBy: { ledgerAt: 'desc' },
      take: 1000,
    }),
    prisma.adminAuditLog.findMany({
      orderBy: { performedAt: 'desc' },
      take: 1000,
    }),
    fetchAuditTrail({
      from: filters.from,
      to: filters.to,
      actor: filters.actor,
      category: filters.category,
    }),
  ]);

  return {
    type: REPORT_TYPES.ACTIVITY,
    generatedAt: now().toISOString(),
    filters,
    summary: {
      auditLogs: auditLogs.length,
      contractEvents: contractEvents.length,
      adminAuditLogs: adminAuditLogs.length,
    },
    auditLogs: auditLogs.map((row) => ({
      id: row.id.toString(),
      category: row.category,
      action: row.action,
      actor: row.actor,
      resourceId: row.resourceId,
      statusCode: row.statusCode,
      createdAt: toIso(row.createdAt),
    })),
    contractEvents: contractEvents.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      escrowId: event.escrowId?.toString() ?? null,
      txHash: event.txHash,
      ledger: event.ledger.toString(),
      ledgerAt: toIso(event.ledgerAt),
    })),
    adminActions: adminAuditLogs.map((row) => ({
      id: row.id,
      action: row.action,
      targetAddress: row.targetAddress,
      reason: row.reason,
      performedBy: row.performedBy,
      performedAt: toIso(row.performedAt),
    })),
    auditTrail,
  };
}

async function generateReport(type, filters = {}, actor = 'system') {
  ensureValidReportType(type);

  let report;
  if (type === REPORT_TYPES.TRANSACTIONS) report = await buildTransactionReport(filters);
  if (type === REPORT_TYPES.USERS) report = await buildUserReport(filters);
  if (type === REPORT_TYPES.ACTIVITY) report = await buildActivityReport(filters);

  await auditService.log({
    category: AuditCategory.REPORTING,
    action: AuditAction.REPORT_GENERATED,
    actor,
    resourceId: type,
    metadata: { filters, generatedAt: report.generatedAt },
  });

  return report;
}

function flattenReportRows(report) {
  if (report.type === REPORT_TYPES.TRANSACTIONS) {
    return report.transactions.map((row) => ({
      kind: 'payment',
      id: row.id,
      address: row.address,
      escrowId: row.escrowId,
      status: row.status,
      amountFiat: row.amountFiat,
      amountCrypto: row.amountCrypto,
      currency: row.currency,
      createdAt: row.createdAt,
    }));
  }

  if (report.type === REPORT_TYPES.USERS) {
    return report.users.map((row) => ({
      id: row.id,
      email: row.email,
      kycStatus: row.kyc?.status ?? null,
      reputationScore: row.reputation?.totalScore ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  return report.auditLogs.map((row) => ({
    id: row.id,
    category: row.category,
    action: row.action,
    actor: row.actor,
    resourceId: row.resourceId,
    createdAt: row.createdAt,
  }));
}

function escapePdfText(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value) => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(',')),
  ];
  return lines.join('\n');
}

function createSimplePdf(title, lines) {
  const stream = [
    'BT',
    '/F1 12 Tf',
    '50 780 Td',
    `(${escapePdfText(title)}) Tj`,
    '0 -18 Td',
    ...lines.flatMap((line) => [`(${escapePdfText(line)}) Tj`, '0 -14 Td']),
    'ET',
  ].join('\n');

  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${Buffer.byteLength(stream, 'utf8')} >> stream\n${stream}\nendstream endobj`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${object}\n`;
  }

  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

async function exportReport(type, format = EXPORT_FORMATS.JSON, filters = {}, actor = 'system') {
  ensureValidExportFormat(format);
  const report = await generateReport(type, filters, actor);

  await auditService.log({
    category: AuditCategory.REPORTING,
    action: AuditAction.REPORT_EXPORTED,
    actor,
    resourceId: type,
    metadata: { format, filters },
  });

  if (format === EXPORT_FORMATS.JSON) {
    return {
      contentType: 'application/json',
      extension: 'json',
      body: JSON.stringify(report, null, 2),
    };
  }

  if (format === EXPORT_FORMATS.CSV) {
    return {
      contentType: 'text/csv',
      extension: 'csv',
      body: toCsv(flattenReportRows(report)),
    };
  }

  const lines = flattenReportRows(report)
    .slice(0, 40)
    .map((row) => Object.values(row).filter(Boolean).join(' | '));
  return {
    contentType: 'application/pdf',
    extension: 'pdf',
    body: createSimplePdf(`Compliance Report: ${type}`, lines),
  };
}

async function runScheduledReport(schedule, trigger = 'system') {
  const report = await generateReport(schedule.type, schedule.filters, trigger);
  const exportResult = await exportReport(schedule.type, schedule.format, schedule.filters, trigger);
  const historyEntry = {
    id: `${schedule.id}-${Date.now()}`,
    scheduleId: schedule.id,
    type: schedule.type,
    format: schedule.format,
    generatedAt: report.generatedAt,
    trigger,
    byteLength: Buffer.isBuffer(exportResult.body)
      ? exportResult.body.length
      : Buffer.byteLength(exportResult.body, 'utf8'),
  };

  schedule.lastRunAt = report.generatedAt;
  schedule.nextRunAt = buildScheduleNextRun(schedule.frequency).toISOString();
  scheduleState.history.unshift(historyEntry);

  await auditService.log({
    category: AuditCategory.REPORTING,
    action: AuditAction.REPORT_SCHEDULED_RUN,
    actor: trigger,
    resourceId: schedule.id,
    metadata: historyEntry,
  });

  return historyEntry;
}

async function processDueSchedules() {
  const dueSchedules = scheduleState.definitions.filter(
    (schedule) => !schedule.disabled && new Date(schedule.nextRunAt).getTime() <= Date.now(),
  );
  const results = [];
  for (const schedule of dueSchedules) {
    results.push(await runScheduledReport(schedule, 'system'));
  }
  return results;
}

function startScheduler() {
  if (scheduleState.timer || process.env.COMPLIANCE_REPORT_SCHEDULER === 'disabled') {
    return;
  }

  const intervalMs = Number.parseInt(process.env.COMPLIANCE_REPORT_SCHEDULER_INTERVAL_MS ?? '60000', 10);
  scheduleState.timer = setInterval(() => {
    processDueSchedules().catch((error) => {
      console.error('[ComplianceService] scheduled report processing failed:', error.message);
    });
  }, intervalMs);
}

function stopScheduler() {
  if (scheduleState.timer) {
    clearInterval(scheduleState.timer);
    scheduleState.timer = null;
  }
}

async function createSchedule({ type, format, frequency, filters = {}, createdBy = 'admin' }) {
  ensureValidReportType(type);
  ensureValidExportFormat(format);
  ensureValidFrequency(frequency);

  const schedule = {
    id: `compliance-${scheduleState.nextId++}`,
    type,
    format,
    frequency,
    filters,
    createdBy,
    createdAt: now().toISOString(),
    lastRunAt: null,
    nextRunAt: buildScheduleNextRun(frequency).toISOString(),
    disabled: false,
  };

  scheduleState.definitions.push(schedule);
  await auditService.log({
    category: AuditCategory.REPORTING,
    action: AuditAction.REPORT_SCHEDULED,
    actor: createdBy,
    resourceId: schedule.id,
    metadata: { type, format, frequency, filters },
  });
  return schedule;
}

function listSchedules() {
  return {
    schedules: [...scheduleState.definitions],
    history: [...scheduleState.history],
  };
}

function getSchedule(scheduleId) {
  const schedule = scheduleState.definitions.find((entry) => entry.id === scheduleId);
  if (!schedule) throw new Error('Schedule not found');
  return schedule;
}

async function disableSchedule(scheduleId, actor = 'admin') {
  const schedule = getSchedule(scheduleId);
  schedule.disabled = true;
  await auditService.log({
    category: AuditCategory.REPORTING,
    action: AuditAction.REPORT_SCHEDULE_DISABLED,
    actor,
    resourceId: scheduleId,
  });
  return schedule;
}

function __resetForTests() {
  stopScheduler();
  scheduleState.definitions = [];
  scheduleState.history = [];
  scheduleState.nextId = 1;
}

export {
  EXPORT_FORMATS,
  REPORT_TYPES,
  SCHEDULE_FREQUENCIES,
  __resetForTests,
  createSchedule,
  disableSchedule,
  exportReport,
  generateReport,
  listSchedules,
  processDueSchedules,
  runScheduledReport,
  startScheduler,
  stopScheduler,
};

export default {
  REPORT_TYPES,
  EXPORT_FORMATS,
  SCHEDULE_FREQUENCIES,
  generateReport,
  exportReport,
  createSchedule,
  listSchedules,
  getSchedule,
  disableSchedule,
  processDueSchedules,
  runScheduledReport,
  startScheduler,
  stopScheduler,
  __resetForTests,
};
