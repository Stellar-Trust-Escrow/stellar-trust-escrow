export class AppError extends Error {
  constructor(message, status = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const notFound = (msg = 'Resource not found') => new AppError(msg, 404, 'NOT_FOUND');
export const unauthorized = (msg = 'Unauthorized') => new AppError(msg, 401, 'UNAUTHORIZED');
export const forbidden = (msg = 'Forbidden') => new AppError(msg, 403, 'FORBIDDEN');
export const badRequest = (msg, code = 'BAD_REQUEST') => new AppError(msg, 400, code);
export const conflict = (msg, code = 'CONFLICT') => new AppError(msg, 409, code);
export const tooManyRequests = (msg = 'Too many requests') =>
  new AppError(msg, 429, 'RATE_LIMITED');
