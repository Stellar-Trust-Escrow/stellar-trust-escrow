import express from 'express';
import { handleBatch } from '../controllers/batchController.js';

const router = express.Router();

/**
 * @route  POST /api/batch
 * @desc   Execute multiple API requests in a single call.
 * @body   Array of { method, url, body?, headers? }
 */
router.post('/', handleBatch);

export default router;
