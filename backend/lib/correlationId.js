import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

const storage = new AsyncLocalStorage();

export const middleware = (req, res, next) => {
  const id = req.headers['x-correlation-id'] || randomUUID();
  req.correlationId = id;
  res.setHeader('x-correlation-id', id);
  storage.run({ correlationId: id }, next);
};

export const getCorrelationId = () => storage.getStore()?.correlationId ?? '-';
