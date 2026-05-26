import { validationResult, query, param } from 'express-validator';

/** Maximum unsigned 64-bit integer (inclusive) for on-chain / DB escrow identifiers. */
const U64_MAX = 18446744073709551615n;

/**
 * Runs express-validator chains and, on failure, responds with HTTP 400 and a stable JSON body.
 *
 * Response shape:
 * `{ error: 'Validation failed', details: [{ field, message, location }] }`
 *
 * @param {import('express-validator').ValidationChain[]} chains
 * @returns {import('express').RequestHandler}
 */
export function validate(chains) {
  return async (req, res, next) => {
    await Promise.all(chains.map((c) => c.run(req)));
    const result = validationResult(req);
    if (result.isEmpty()) {
      return next();
    }
    const details = result.array({ onlyFirstError: false }).map((e) => ({
      field: e.path,
      message: e.msg,
      location: e.location,
    }));
    return res.status(400).json({
      error: 'Validation failed',
      details,
    });
  };
}

// ── Dispute API schemas (express-validator chains) ───────────────────────────

/**
 * GET /api/disputes — query parameters
 *
 * | Field  | Required | Type    | Rules                          |
 * |--------|----------|---------|--------------------------------|
 * | page   | no       | integer | 1 ≤ page ≤ 1_000_000           |
 * | limit  | no       | integer | 1 ≤ limit ≤ 100                |
 *
 * Omitted or empty (falsy) values fall through to controller defaults.
 */
export const disputeListQueryRules = [
  query('page')
    .optional({ values: 'falsy' })
    .isInt({ min: 1, max: 1_000_000 })
    .withMessage('page must be an integer between 1 and 1000000'),
  query('limit')
    .optional({ values: 'falsy' })
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be an integer between 1 and 100'),
];

/**
 * GET /api/disputes/:escrowId — route parameter
 *
 * | Field     | Required | Type   | Rules                                                |
 * |-----------|----------|--------|------------------------------------------------------|
 * | escrowId  | yes      | string | Decimal digits only, 1 ≤ value ≤ 2^64−1, length ≤ 20 |
 */
export const disputeEscrowIdParamRules = [
  param('escrowId')
    .trim()
    .notEmpty()
    .withMessage('escrowId is required')
    .matches(/^[0-9]+$/)
    .withMessage('escrowId must be a non-negative decimal string')
    .isLength({ min: 1, max: 20 })
    .withMessage('escrowId must be between 1 and 20 digits')
    .custom((value) => {
      try {
        const n = BigInt(value);
        if (n < 1n || n > U64_MAX) {
          throw new Error('out of range');
        }
        return true;
      } catch {
        throw new Error('escrowId must be a valid escrow identifier');
      }
    }),
];
