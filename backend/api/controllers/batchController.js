import supertest from 'supertest';

const MAX_BATCH_SIZE = parseInt(process.env.MAX_BATCH_SIZE || '20', 10);
const MAX_ITEM_BODY_BYTES = parseInt(
  process.env.MAX_BATCH_ITEM_BODY_BYTES || String(64 * 1024),
  10,
);
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

// Routes that the batch endpoint is allowed to proxy. Anything not on this
// list is rejected so the batch endpoint cannot be used as an open relay to
// internal-only paths (e.g. /admin, /internal/*, health-check endpoints).
const BATCH_ALLOWED_ROUTES = new Set(
  (
    process.env.BATCH_ALLOWED_ROUTES ||
    '/api/escrows,/api/milestones,/api/disputes,/api/users,/api/reputation,/api/search'
  ).split(','),
);

async function dispatchRequest(app, { method = 'GET', url, body, headers = {} }, parentReq) {
  const upperMethod = method.toUpperCase();
  if (!ALLOWED_METHODS.has(upperMethod)) {
    return { status: 400, data: { error: `Method not allowed: ${method}` }, headers: {} };
  }

  const urlPath = url.split('?')[0];
  const isAllowed = [...BATCH_ALLOWED_ROUTES].some((prefix) => urlPath.startsWith(prefix));
  if (!isAllowed) {
    return {
      status: 403,
      data: { error: `Route not permitted in batch: ${urlPath}` },
      headers: {},
    };
  }

  if (body !== undefined) {
    const bodySize = Buffer.byteLength(JSON.stringify(body), 'utf8');
    if (bodySize > MAX_ITEM_BODY_BYTES) {
      return {
        status: 413,
        data: {
          error: `Batch item body too large (${bodySize} bytes, max ${MAX_ITEM_BODY_BYTES})`,
        },
        headers: {},
      };
    }
  }

  // Propagate parent auth unless the sub-request overrides it
  const authHeader = parentReq.headers['authorization'];
  if (authHeader && !headers['authorization'] && !headers['Authorization']) {
    headers = { ...headers, authorization: authHeader };
  }

  try {
    const agent = supertest(app)[upperMethod.toLowerCase()](url);

    for (const [key, value] of Object.entries(headers)) {
      agent.set(key, value);
    }

    if (body && (upperMethod === 'POST' || upperMethod === 'PUT' || upperMethod === 'PATCH')) {
      agent.send(body);
    }

    const response = await agent;
    return {
      status: response.status,
      data: response.body,
      headers: response.headers,
    };
  } catch (err) {
    return { status: 500, data: { error: err.message }, headers: {} };
  }
}

export async function handleBatch(req, res) {
  const requests = req.body;

  if (!Array.isArray(requests)) {
    return res.status(400).json({ error: 'Request body must be an array.' });
  }

  if (requests.length > MAX_BATCH_SIZE) {
    return res.status(413).json({
      error: `Batch size ${requests.length} exceeds maximum allowed (${MAX_BATCH_SIZE}).`,
    });
  }

  const results = await Promise.allSettled(
    requests.map((item) => dispatchRequest(req.app, item, req)),
  );

  const responses = results.map((result) =>
    result.status === 'fulfilled'
      ? result.value
      : { status: 500, data: { error: result.reason?.message || 'Internal error' }, headers: {} },
  );

  return res.status(200).json(responses);
}
