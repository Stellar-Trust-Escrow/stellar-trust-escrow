import { Router } from 'express';
import { pool } from '../websocket/handlers.js';

const router = Router();

router.get('/', (_req, res) => {
  res.status(200).json(pool.getMetrics());
});

export default router;
