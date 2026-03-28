const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export function buildAdminHeaders(apiKey, headers = {}) {
  return {
    'Content-Type': 'application/json',
    'x-admin-api-key': apiKey || '',
    ...headers,
  };
}

export function adminFetch(path, apiKey, options = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: buildAdminHeaders(apiKey, options.headers),
  });
}
