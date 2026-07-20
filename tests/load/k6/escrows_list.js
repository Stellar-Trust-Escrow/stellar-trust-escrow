import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, stages, thresholds } from './config.js';
import { getAuthToken } from './auth.js';
import { handleSummaryWithBaseline } from './summary.js';

export const options = {
  stages,
  thresholds,
};

export function setup() {
  const token = getAuthToken();
  return { token };
}

export default function (data) {
  const params = {
    headers: {
      Authorization: `Bearer ${data.token}`,
    },
    tags: { endpoint: 'escrow_list' },
  };

  const res = http.get(`${BASE_URL}/api/v1/escrows?page=1&limit=10`, params);

  check(res, {
    'status is 200': (r) => r.status === 200,
  });
}

export function handleSummary(data) {
  return handleSummaryWithBaseline(data);
}
