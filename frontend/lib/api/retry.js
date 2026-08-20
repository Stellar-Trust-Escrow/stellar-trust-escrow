/**
 * Retry a function up to `retries` times with exponential backoff.
 * @param {() => Promise<any>} fn  - async function to retry
 * @param {number} retries         - max retry attempts (default 3)
 * @param {number} baseDelayMs     - initial delay in ms (doubles each attempt)
 */
export async function retryRequest(fn, retries = 3, baseDelayMs = 300) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > retries) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
