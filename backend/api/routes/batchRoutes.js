import express from 'express';
import batchController from '../controllers/batchController.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

/**
 * @route  POST /api/batch
 * @desc   Execute multiple API requests in a single call.
 * @body   {
 *           requests: Array<{
 *             id?:      string | number,   // optional correlation ID echoed back
 *             method:   string,            // GET | POST | PUT | PATCH | DELETE
 *             path:     string,            // e.g. "/api/escrows/123"
 *             body?:    object,            // request body for mutating methods
 *             headers?: object             // per-request header overrides
 *           }>
 *         }
 * @returns {
 *            results: Array<{
 *              id:     string | number,
 *              status: number,
 *              body:   any
 *            }>
 *          }
 */
router.post('/', authMiddleware, batchController.executeBatch);

export default router;
