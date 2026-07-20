import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL } from './config.js';

export function getAuthToken() {
  const payload = JSON.stringify({
    email: 'client@example.com',
    password: 'password123',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const res = http.post(`${BASE_URL}/api/v1/auth/login`, payload, params);

  check(res, {
    'auth successful': (r) => r.status === 200,
  });

  if (res.status === 200) {
    const body = res.json();
    return body.token || body.accessToken || res.headers['Authorization'] || res.headers['authorization'];
  }
  
  return null;
}
