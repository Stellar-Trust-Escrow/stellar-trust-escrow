import { z } from 'zod';

const objectBody = z.record(z.unknown());
const emptyBody = z.union([z.undefined(), z.null()]);
const signedXdrSchema = z.object({
  signedXdr: z.string().trim().min(1).max(100_000),
});

const ROUTE_SCHEMAS = [
  { method: 'POST', pattern: /^\/api\/escrows\/broadcast$/, schema: signedXdrSchema },
];

function schemaFor(req) {
  return ROUTE_SCHEMAS.find((route) => route.method === req.method && route.pattern.test(req.path))
    ?.schema;
}

export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (result.success) {
      req.body = result.data;
      return next();
    }

    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request body validation failed.',
        details: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
  };
}

export default function zodValidationMiddleware(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || !req.path.startsWith('/api/')) {
    return next();
  }

  const schema = schemaFor(req) ?? (req.body == null ? emptyBody : objectBody);
  return validateBody(schema)(req, res, next);
}
