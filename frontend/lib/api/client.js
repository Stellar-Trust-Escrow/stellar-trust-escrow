import axios from 'axios';
import { getOnlineStatus } from '../network';
import { retryRequest } from './retry';
import { getToken, clearToken } from '../auth/token';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

// Auth interceptor must run before the retry wrapper sees the request, so it
// is registered first and attaches the bearer token to every outgoing call.
api.interceptors.request.use((config) => {
  if (!getOnlineStatus()) {
    return Promise.reject({
      message: 'You are offline. Please check your internet connection.',
      isOffline: true,
    });
  }

  const token = getToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearToken();
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  },
);

// Wrap axios requests with retry
export const requestWithRetry = async (axiosConfig, retries = 3) => {
  return retryRequest(() => api(axiosConfig), retries);
};

export default api;
