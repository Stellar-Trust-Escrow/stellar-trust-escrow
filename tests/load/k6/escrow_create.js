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
  // Generate random data for creation
  const uniqueId = __VU + '-' + __ITER;
  const payload = JSON.stringify({
    freelancerAddress: 'GXYZ1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ234567890ABCDE',
    tokenAddress: 'USDC_SAC_CONTRACT_ADDRESS_TESTNET',
    amount: '1000',
    title: `Load Test Escrow ${uniqueId}`,
    description: 'Testing creation',
    milestones: [
      { title: 'M1', amount: '500' },
      { title: 'M2', amount: '500' }
    ]
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.token}`,
    },
    tags: { endpoint: 'escrow_create' },
  };

  const res = http.post(`${BASE_URL}/api/v1/escrows`, payload, params);

  check(res, {
    'status is 200 or 201': (r) => r.status === 200 || r.status === 201,
  });
}

export function handleSummary(data) {
  return handleSummaryWithBaseline(data);
}
