/**
 * Zod schema validation middleware factory.
 *
 * Returns an Express middleware that validates the specified request
 * source (body, query, params) against a Zod schema. On failure it
 * returns 400 with a structured error body:
 *
 *   { error: { code, message, fields: [{ field, message }] } }
 */

/**
 * @param {import('zod').ZodTypeAny} schema
 * @param {'body'|'query'|'params'} [source='body']
 * @returns {import('express').RequestHandler}
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (result.success) {
      // body is writable; query/params are getter-only in Express — skip reassignment
      if (source === 'body') req.body = result.data;
      return next();
    }
    const fields = result.error.issues.map((e) => ({
      field: e.path.join('.') || source,
      message: e.message,
    }));
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        fields,
      },
    });
  };
}

/**
 * Validate multiple sources at once.
 *
 * @param {{ body?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny, params?: import('zod').ZodTypeAny }} schemas
 * @returns {import('express').RequestHandler[]}
 */
export function validateAll(schemas) {
  return Object.entries(schemas).map(([source, schema]) =>
    validate(schema, source),
  );
}
