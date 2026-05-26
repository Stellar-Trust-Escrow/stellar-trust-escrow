import axios from "axios";
import { getOnlineStatus } from "../network";
import { retryRequest } from "./retry";

const api = axios.create({
  baseURL: "/api",
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  if (!getOnlineStatus()) {
    return Promise.reject({
      message: "You are offline. Please check your internet connection.",
      isOffline: true,
    });
  }
  return config;
});

// Wrap axios requests with retry
export const requestWithRetry = async (axiosConfig, retries = 3) => {
  return retryRequest(() => api(axiosConfig), retries);
};

export default api;