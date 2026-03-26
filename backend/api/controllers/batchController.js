const MAX_BATCH_SIZE = 20;

// Supported internal routes mapped to their handlers
// Each entry: { method, pathRegex, handler }
// We resolve requests by forwarding them through Express's app internally.

/**
 * Parses a batch request item into { method, path, body, headers }.
 * Returns an error string if invalid.
 */
function parseRequest(item) {
  if (!item || typeof item !== 'object') return 'Each request must be an object';
  if (!item.method || typeof item.method !== 'string') return 'Missing or invalid "method"';
  if (!item.path || typeof item.path !== 'string') return 'Missing or invalid "path"';

  const method = item.method.toUpperCase();
  const allowed = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  if (!allowed.includes(method)) return `Unsupported method: ${method}`;

  return null;
}

/**
 * Executes a single sub-request by making an internal HTTP call via the
 * Express app attached to req.app.
 */
function executeRequest(app, parentReq, item) {
  return new Promise((resolve) => {
    const method = item.method.toUpperCase();
    const url = item.path; // e.g. "/api/escrows/123"

    // Build a minimal mock request
    const mockReq = Object.create(parentReq, {
      method: { value: method },
      url: { value: url },
      path: { value: url.split('?')[0] },
      query: {
        value: Object.fromEntries(new URL(url, 'http://localhost').searchParams),
      },
      body: { value: item.body || {} },
      headers: {
        value: {
          ...parentReq.headers,
          ...(item.headers || {}),
        },
      },
      // Carry auth from parent request
      user: { value: parentReq.user },
    });

    const chunks = [];
    let statusCode = 200;
    const responseHeaders = {};

    const mockRes = {
      statusCode: 200,
      status(code) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      set(key, value) {
        responseHeaders[key] = value;
        return this;
      },
      setHeader(key, value) {
        responseHeaders[key] = value;
        return this;
      },
      getHeader(key) {
        return responseHeaders[key];
      },
      json(data) {
        resolve({ status: statusCode, body: data });
      },
      send(data) {
        if (typeof data === 'object') {
          resolve({ status: statusCode, body: data });
        } else {
          resolve({ status: statusCode, body: data });
        }
      },
      end() {
        resolve({ status: statusCode, body: null });
      },
    };

    try {
      app.handle(mockReq, mockRes, () => {
        resolve({ status: 404, body: { error: 'Route not found' } });
      });
    } catch (err) {
      resolve({ status: 500, body: { error: err.message } });
    }
  });
}

const executeBatch = async (req, res) => {
  const { requests } = req.body;

  if (!Array.isArray(requests)) {
    return res.status(400).json({ error: '"requests" must be an array' });
  }

  if (requests.length === 0) {
    return res.status(400).json({ error: '"requests" array must not be empty' });
  }

  if (requests.length > MAX_BATCH_SIZE) {
    return res
      .status(400)
      .json({ error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE}` });
  }

  // Validate all requests upfront
  for (let i = 0; i < requests.length; i++) {
    const err = parseRequest(requests[i]);
    if (err) {
      return res.status(400).json({ error: `Request[${i}]: ${err}` });
    }
  }

  const app = req.app;

  // Execute all requests in parallel
  const results = await Promise.all(
    requests.map((item, i) =>
      executeRequest(app, req, item).then((result) => ({
        id: item.id ?? i,
        status: result.status,
        body: result.body,
      })),
    ),
  );

  return res.json({ results });
};

export default { executeBatch };
