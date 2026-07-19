export const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

export const stages = [
  { duration: '30s', target: 10 },   // ramp up
  { duration: '2m', target: 50 },    // sustained load
  { duration: '30s', target: 100 },  // spike
  { duration: '1m', target: 0 },     // ramp down
];

export const thresholds = {
  'http_req_duration{endpoint:escrow_list}': ['p(95)<200'],
  'http_req_duration{endpoint:escrow_detail}': ['p(95)<150'],
  'http_req_duration{endpoint:escrow_create}': ['p(95)<500'],
  'http_req_duration{endpoint:milestone_release}': ['p(95)<600'],
  'http_req_duration{endpoint:auth_login}': ['p(95)<300'],
  'http_req_failed': ['rate<0.01'],
};
