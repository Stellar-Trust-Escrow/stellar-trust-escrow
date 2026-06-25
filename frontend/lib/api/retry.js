const RETRY_DELAYS_MS = [500, 1000, 2000];

export async function retryRequest(fn, retries = 3) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const shouldRetry =
        attempt < retries - 1 &&
        (!err?.response || err.response.status >= 500);
      if (!shouldRetry) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt] ?? 2000));
    }
  }
  throw lastError;
}
