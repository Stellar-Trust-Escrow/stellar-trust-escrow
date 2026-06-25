import express from 'express';
import { handleBatch } from '../controllers/batchController.js';

const router = express.Router();

/**
 * @route  POST /api/batch
 * @desc   Execute multiple API requests in a single call.
 * @body   Array of { method, url, body?, headers? }
 */
router.post(
  '/',
  (req, res, next) => {
    // Belt-and-suspenders recursive batch guard: dispatchRequest sets this header on every
    // sub-request, so if we see it here the caller has nested a batch inside a batch.
    if (req.headers['x-batch-request']) {
      return res.status(400).json({ error: 'Recursive batch requests are not permitted.' });
    }
    return next();
  },
  handleBatch,
);

export default router;
