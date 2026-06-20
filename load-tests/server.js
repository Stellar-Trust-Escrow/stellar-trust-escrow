/* global process, URL */
import http from 'http';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, 'data', 'generated.json');

function parsePagination(searchParams) {
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(searchParams.get('limit') ?? '20', 10) || 20),
  );
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function paginate(data, { page, limit, total }) {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  return {
    data,
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1 && totalPages > 0,
  };
}

function compareNumericStrings(left, right) {
  const a = BigInt(left);
  const b = BigInt(right);
  return a === b ? 0 : a > b ? 1 : -1;
}

function sortEscrows(items, sortBy = 'createdAt', sortOrder = 'desc') {
  const direction = sortOrder === 'asc' ? 1 : -1;
  return [...items].sort((left, right) => {
    if (sortBy === 'totalAmount') {
      return compareNumericStrings(left.totalAmount, right.totalAmount) * direction;
    }
    const leftValue = left[sortBy];
    const rightValue = right[sortBy];
    if (leftValue === rightValue) return 0;
    return leftValue > rightValue ? direction : -direction;
  });
}

async function loadData() {
  const raw = await readFile(dataPath, 'utf8');
  const data = JSON.parse(raw);

  const escrowsById = new Map(data.escrows.map((escrow) => [String(escrow.id), escrow]));
  const milestonesByEscrowId = new Map();
  for (const milestone of data.milestones) {
    const key = String(milestone.escrowId);
    const existing = milestonesByEscrowId.get(key) ?? [];
    existing.push(milestone);
    milestonesByEscrowId.set(key, existing);
  }

  const usersByAddress = new Map(data.users.map((user) => [user.address, user]));

  return { ...data, escrowsById, milestonesByEscrowId, usersByAddress };
}

function respondJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function makeHandler(dataset) {
  return (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const pathname = url.pathname;

    if (req.method !== 'GET') {
      return respondJson(res, 405, { error: 'Method not allowed' });
    }

    if (pathname === '/health') {
      return respondJson(res, 200, {
        status: 'ok',
        timestamp: new Date().toISOString(),
        dataset: {
          users: dataset.users.length,
          escrows: dataset.escrows.length,
          milestones: dataset.milestones.length,
        },
      });
    }

    if (pathname === '/api/escrows') {
      const { page, limit, skip } = parsePagination(url.searchParams);
      let items = dataset.escrows;

      const statusParam = url.searchParams.get('status');
      if (statusParam) {
        const statuses = statusParam
          .split(',')
          .map((status) => status.trim())
          .filter(Boolean);
        items = items.filter((escrow) => statuses.includes(escrow.status));
      }

      const client = url.searchParams.get('client');
      if (client) {
        items = items.filter((escrow) => escrow.clientAddress === client);
      }

      const freelancer = url.searchParams.get('freelancer');
      if (freelancer) {
        items = items.filter((escrow) => escrow.freelancerAddress === freelancer);
      }

      const search = url.searchParams.get('search');
      if (search) {
        const term = search.toLowerCase();
        items = items.filter(
          (escrow) =>
            String(escrow.id).includes(term) ||
            escrow.clientAddress.toLowerCase().includes(term) ||
            escrow.freelancerAddress.toLowerCase().includes(term),
        );
      }

      const minAmount = url.searchParams.get('minAmount');
      if (minAmount) {
        items = items.filter((escrow) => compareNumericStrings(escrow.totalAmount, minAmount) >= 0);
      }

      const maxAmount = url.searchParams.get('maxAmount');
      if (maxAmount) {
        items = items.filter((escrow) => compareNumericStrings(escrow.totalAmount, maxAmount) <= 0);
      }

      items = sortEscrows(
        items,
        url.searchParams.get('sortBy') ?? 'createdAt',
        url.searchParams.get('sortOrder') ?? 'desc',
      );

      return respondJson(
        res,
        200,
        paginate(items.slice(skip, skip + limit), { page, limit, total: items.length }),
      );
    }

    const escrowDetailMatch = pathname.match(/^\/api\/escrows\/(\d+)$/);
    if (escrowDetailMatch) {
      const escrowId = escrowDetailMatch[1];
      const escrow = dataset.escrowsById.get(escrowId);
      if (!escrow) {
        return respondJson(res, 404, { error: 'Escrow not found' });
      }

      return respondJson(res, 200, {
        ...escrow,
        milestones: dataset.milestonesByEscrowId.get(escrowId) ?? [],
        dispute: escrow.status === 'Disputed' ? { escrowId: escrow.id, resolution: null } : null,
      });
    }

    const escrowMilestonesMatch = pathname.match(/^\/api\/escrows\/(\d+)\/milestones$/);
    if (escrowMilestonesMatch) {
      const escrowId = escrowMilestonesMatch[1];
      if (!dataset.escrowsById.has(escrowId)) {
        return respondJson(res, 404, { error: 'Escrow not found' });
      }

      const { page, limit, skip } = parsePagination(url.searchParams);
      const items = dataset.milestonesByEscrowId.get(escrowId) ?? [];
      return respondJson(
        res,
        200,
        paginate(items.slice(skip, skip + limit), { page, limit, total: items.length }),
      );
    }

    const userProfileMatch = pathname.match(/^\/api\/users\/(G[A-Z2-7]{55})$/);
    if (userProfileMatch) {
      const address = userProfileMatch[1];
      const user = dataset.usersByAddress.get(address);
      if (!user) {
        return respondJson(res, 404, { error: 'User not found' });
      }

      return respondJson(res, 200, {
        address: user.address,
        reputation: {
          address: user.address,
          totalScore: Number.parseInt(user.totalScore, 10),
          completedEscrows: user.completedEscrows,
          disputedEscrows: user.disputedEscrows,
          disputesWon: user.disputesWon,
          totalVolume: user.totalVolume,
        },
        recentEscrows: user.recentEscrows,
      });
    }

    const userEscrowsMatch = pathname.match(/^\/api\/users\/(G[A-Z2-7]{55})\/escrows$/);
    if (userEscrowsMatch) {
      const address = userEscrowsMatch[1];
      if (!dataset.usersByAddress.has(address)) {
        return respondJson(res, 404, { error: 'User not found' });
      }

      const { page, limit, skip } = parsePagination(url.searchParams);
      const role = url.searchParams.get('role') ?? 'all';
      let items = dataset.escrows.filter((escrow) => {
        if (role === 'client') return escrow.clientAddress === address;
        if (role === 'freelancer') return escrow.freelancerAddress === address;
        return escrow.clientAddress === address || escrow.freelancerAddress === address;
      });

      const status = url.searchParams.get('status');
      if (status) {
        items = items.filter((escrow) => escrow.status === status);
      }

      items = sortEscrows(items, 'createdAt', 'desc');
      return respondJson(
        res,
        200,
        paginate(items.slice(skip, skip + limit), { page, limit, total: items.length }),
      );
    }

    const userStatsMatch = pathname.match(/^\/api\/users\/(G[A-Z2-7]{55})\/stats$/);
    if (userStatsMatch) {
      const address = userStatsMatch[1];
      const user = dataset.usersByAddress.get(address);
      if (!user) {
        return respondJson(res, 404, { error: 'User not found' });
      }

      const items = dataset.escrows.filter(
        (escrow) => escrow.clientAddress === address || escrow.freelancerAddress === address,
      );
      const escrowsByStatus = Object.fromEntries(
        ['Active', 'Completed', 'Disputed', 'Cancelled'].map((status) => [
          status,
          items.filter((escrow) => escrow.status === status).length,
        ]),
      );
      const totalEscrows = items.length;
      const completedEscrows = escrowsByStatus.Completed ?? 0;

      return respondJson(res, 200, {
        address: user.address,
        totalEscrows,
        completionRate: totalEscrows > 0 ? (completedEscrows / totalEscrows).toFixed(4) : '0',
        escrowsByStatus,
        reputation: {
          address: user.address,
          totalScore: Number.parseInt(user.totalScore, 10),
          completedEscrows: user.completedEscrows,
          disputedEscrows: user.disputedEscrows,
          disputesWon: user.disputesWon,
          totalVolume: user.totalVolume,
        },
      });
    }

    return respondJson(res, 404, { error: 'Route not found' });
  };
}

export async function startLoadTestServer(
  port = Number.parseInt(process.env.LOAD_TEST_PORT || '4100', 10),
) {
  const dataset = await loadData();
  const server = http.createServer(makeHandler(dataset));

  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({
        server,
        port,
        url: `http://127.0.0.1:${port}`,
        async close() {
          await new Promise((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) closeReject(error);
              else closeResolve();
            });
          });
        },
      });
    });

    server.on('error', reject);
  });
}
