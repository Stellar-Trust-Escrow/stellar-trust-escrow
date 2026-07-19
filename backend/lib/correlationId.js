import { AsyncLocalStorage } from 'async_hooks';

const correlationStorage = new AsyncLocalStorage();

/**
 * Runs a function within an AsyncLocalStorage context.
 * Store contains { correlationId, traceId, spanId }.
 * @param {Object} context - { correlationId, traceId, spanId }
 * @param {Function} callback
 * @returns {*}
 */
export function runWithContext(context, callback) {
  const store = {
    correlationId: context.correlationId || '',
    traceId: context.traceId || '',
    spanId: context.spanId || '',
  };
  return correlationStorage.run(store, callback);
}

/**
 * Returns the active store object from AsyncLocalStorage, or undefined if outside context.
 * @returns {{ correlationId: string, traceId: string, spanId: string } | undefined}
 */
export function getCorrelationContext() {
  return correlationStorage.getStore();
}

/**
 * Returns current correlationId or empty string.
 * @returns {string}
 */
export function getCorrelationId() {
  return correlationStorage.getStore()?.correlationId || '';
}

/**
 * Updates partial attributes on the active store.
 * @param {Object} partial
 */
export function updateCorrelationContext(partial) {
  const store = correlationStorage.getStore();
  if (store) {
    Object.assign(store, partial);
  }
}

export { correlationStorage };
export default correlationStorage;
