import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, stages, thresholds } from './config.js';
import { handleSummaryWithBaseline } from './summary.js';

export const options = {
  stages,
  thresholds,
};

export default function () {
  const payload = JSON.stringify({
    email: 'client@example.com',
    password: 'password123',
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'auth_login' },
  };

  const res = http.post(`${BASE_URL}/api/v1/auth/login`, payload, params);

  check(res, {
    'status is 200': (r) => r.status === 200,
  });
}

export function handleSummary(data) {
  return handleSummaryWithBaseline(data);
}
