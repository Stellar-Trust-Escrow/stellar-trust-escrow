import prisma from '../../lib/prisma.js';
import cache from '../../lib/cache.js';
import { logControllerError } from '../../config/logger.js';

// Helper to determine DATE_TRUNC format
function getTruncFormat(granularity) {
  switch (granularity) {
    case 'month':
      return 'month';
    case 'week':
      return 'week';
    case 'day':
    default:
      return 'day';
  }
}

/**
 * GET /api/v1/admin/analytics/volume
 * Query: from=ISO&to=ISO&granularity=day|week|month
 */
const getVolume = async (req, res) => {
  try {
    const { from, to, granularity = 'day' } = req.query;
    const tenantId = req.tenant?.id;

    if (!from || !to) {
      return res.status(400).json({ error: 'from and to query parameters are required' });
    }

    const cacheKey = `admin:analytics:volume:${tenantId || 'all'}:${from}:${to}:${granularity}`;
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const truncFormat = getTruncFormat(granularity);

    const results = await prisma.$queryRaw`
      SELECT 
        DATE_TRUNC(${truncFormat}, created_at) as date_label,
        COUNT(id) as funded,
        SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'Disputed' THEN 1 ELSE 0 END) as disputed
      FROM escrows
      WHERE created_at >= ${new Date(from)} 
        AND created_at <= ${new Date(to)}
        ${tenantId ? prisma.sql`AND tenant_id = ${tenantId}` : prisma.empty}
      GROUP BY date_label
      ORDER BY date_label ASC
    `;

    const labels = [];
    const funded = [];
    const completed = [];
    const disputed = [];

    results.forEach((row) => {
      // Format label
      const d = new Date(row.date_label);
      labels.push(d.toISOString());
      funded.push(Number(row.funded));
      completed.push(Number(row.completed));
      disputed.push(Number(row.disputed));
    });

    const response = { labels, funded, completed, disputed };
    await cache.set(cacheKey, response, 300); // 5 minutes cache
    res.json(response);
  } catch (err) {
    logControllerError('analytics.getVolume', err, req);
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/v1/admin/analytics/dispute-rate
 * Query: from=&to=&granularity=
 */
const getDisputeRate = async (req, res) => {
  try {
    const { from, to, granularity = 'day' } = req.query;
    const tenantId = req.tenant?.id;

    if (!from || !to) {
      return res.status(400).json({ error: 'from and to query parameters are required' });
    }

    const cacheKey = `admin:analytics:dispute-rate:${tenantId || 'all'}:${from}:${to}:${granularity}`;
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const truncFormat = getTruncFormat(granularity);

    const results = await prisma.$queryRaw`
      SELECT 
        DATE_TRUNC(${truncFormat}, created_at) as date_label,
        COUNT(id) as funded,
        SUM(CASE WHEN status = 'Disputed' THEN 1 ELSE 0 END) as disputed
      FROM escrows
      WHERE created_at >= ${new Date(from)} 
        AND created_at <= ${new Date(to)}
        ${tenantId ? prisma.sql`AND tenant_id = ${tenantId}` : prisma.empty}
      GROUP BY date_label
      ORDER BY date_label ASC
    `;

    const labels = [];
    const dispute_rate = [];

    results.forEach((row) => {
      const d = new Date(row.date_label);
      labels.push(d.toISOString());
      const total = Number(row.funded);
      const disp = Number(row.disputed);
      dispute_rate.push(total > 0 ? (disp / total) * 100 : 0);
    });

    const response = { labels, dispute_rate };
    await cache.set(cacheKey, response, 300); // 5 minutes cache
    res.json(response);
  } catch (err) {
    logControllerError('analytics.getDisputeRate', err, req);
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/v1/admin/analytics/resolution-time
 * Query: from=&to=
 */
const getResolutionTime = async (req, res) => {
  try {
    const { from, to } = req.query;
    const tenantId = req.tenant?.id;

    if (!from || !to) {
      return res.status(400).json({ error: 'from and to query parameters are required' });
    }

    const cacheKey = `admin:analytics:resolution-time:${tenantId || 'all'}:${from}:${to}`;
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    // Calculate resolution time in hours
    const results = await prisma.$queryRaw`
      WITH resolution_times AS (
        SELECT 
          EXTRACT(EPOCH FROM (resolved_at - raised_at)) / 3600 AS hours_diff
        FROM disputes
        WHERE resolved_at IS NOT NULL
          AND raised_at >= ${new Date(from)}
          AND raised_at <= ${new Date(to)}
          ${tenantId ? prisma.sql`AND tenant_id = ${tenantId}` : prisma.empty}
      )
      SELECT
        percentile_cont(0.50) WITHIN GROUP (ORDER BY hours_diff) AS p50,
        percentile_cont(0.90) WITHIN GROUP (ORDER BY hours_diff) AS p90,
        percentile_cont(0.99) WITHIN GROUP (ORDER BY hours_diff) AS p99
      FROM resolution_times
    `;

    const histogramResults = await prisma.$queryRaw`
      WITH resolution_times AS (
        SELECT 
          EXTRACT(EPOCH FROM (resolved_at - raised_at)) / 3600 AS hours_diff
        FROM disputes
        WHERE resolved_at IS NOT NULL
          AND raised_at >= ${new Date(from)}
          AND raised_at <= ${new Date(to)}
          ${tenantId ? prisma.sql`AND tenant_id = ${tenantId}` : prisma.empty}
      )
      SELECT 
        FLOOR(hours_diff / 24) * 24 AS bucket_hours,
        COUNT(*) as count
      FROM resolution_times
      GROUP BY bucket_hours
      ORDER BY bucket_hours ASC
    `;

    const stats = results[0] || { p50: 0, p90: 0, p99: 0 };
    const histogram = histogramResults.map(r => ({
      bucket_hours: Number(r.bucket_hours),
      count: Number(r.count)
    }));

    const response = {
      p50_hours: Number(stats.p50 || 0),
      p90_hours: Number(stats.p90 || 0),
      p99_hours: Number(stats.p99 || 0),
      histogram
    };

    await cache.set(cacheKey, response, 300); // 5 minutes cache
    res.json(response);
  } catch (err) {
    logControllerError('analytics.getResolutionTime', err, req);
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/v1/admin/analytics/cohort
 * Query: cohort_month=YYYY-MM
 */
const getCohortRetention = async (req, res) => {
  try {
    const { cohort_month } = req.query;
    const tenantId = req.tenant?.id;

    if (!cohort_month) {
      return res.status(400).json({ error: 'cohort_month query parameter is required' });
    }

    const cacheKey = `admin:analytics:cohort:${tenantId || 'all'}:${cohort_month}`;
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    // Get the start and end of the cohort month
    const [year, month] = cohort_month.split('-');
    if (!year || !month) return res.status(400).json({ error: 'Invalid cohort_month format. Use YYYY-MM' });

    const startDate = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
    const endDate = new Date(Date.UTC(Number(year), Number(month), 1));
    const endDate8Weeks = new Date(Date.UTC(Number(year), Number(month), 1 + 8 * 7));

    // Find users whose FIRST escrow falls within the cohort_month
    const cohortUsers = await prisma.$queryRaw`
      WITH user_first_escrow AS (
        SELECT client_address, MIN(created_at) as first_escrow_date
        FROM escrows
        ${tenantId ? prisma.sql`WHERE tenant_id = ${tenantId}` : prisma.empty}
        GROUP BY client_address
      )
      SELECT client_address
      FROM user_first_escrow
      WHERE first_escrow_date >= ${startDate} AND first_escrow_date < ${endDate}
    `;

    const cohortSize = cohortUsers.length;
    
    if (cohortSize === 0) {
      const emptyResponse = {
        weeks: [1, 2, 3, 4, 5, 6, 7, 8],
        retention: [0, 0, 0, 0, 0, 0, 0, 0]
      };
      await cache.set(cacheKey, emptyResponse, 300);
      return res.json(emptyResponse);
    }

    const clientAddresses = cohortUsers.map(u => u.client_address);

    // Now, for these users, get their activity in the subsequent 8 weeks
    const activity = await prisma.$queryRaw`
      SELECT 
        client_address,
        created_at
      FROM escrows
      WHERE client_address IN (${prisma.join(clientAddresses)})
        AND created_at >= ${startDate}
        AND created_at < ${endDate8Weeks}
        ${tenantId ? prisma.sql`AND tenant_id = ${tenantId}` : prisma.empty}
    `;

    const retentionCounts = new Array(8).fill(0);

    // Map activity to weeks (week 1 is days 0-6 from start date of the cohort month?
    // Wait, the specification: "users who created first escrow in cohort_month, tracked weekly for 8 weeks."
    // Week 1 is the 7 days following the end of the cohort month?
    // Usually, retention tracks the weeks AFTER their first action. 
    // For simplicity, let's track the 8 weeks immediately following the cohort month.
    
    // For each user, if they have any activity in week N (1..8) after cohort_month ends
    clientAddresses.forEach(address => {
      const userActivity = activity.filter(a => a.client_address === address);
      
      for (let week = 1; week <= 8; week++) {
        const weekStart = new Date(endDate.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000);
        const weekEnd = new Date(endDate.getTime() + week * 7 * 24 * 60 * 60 * 1000);
        
        const hasActivity = userActivity.some(a => a.created_at >= weekStart && a.created_at < weekEnd);
        if (hasActivity) {
          retentionCounts[week - 1]++;
        }
      }
    });

    const retention = retentionCounts.map(count => (count / cohortSize) * 100);
    const weeks = [1, 2, 3, 4, 5, 6, 7, 8];

    const response = { weeks, retention };
    await cache.set(cacheKey, response, 300);
    res.json(response);
  } catch (err) {
    logControllerError('analytics.getCohortRetention', err, req);
    res.status(500).json({ error: err.message });
  }
};

export default {
  getVolume,
  getDisputeRate,
  getResolutionTime,
  getCohortRetention
};
