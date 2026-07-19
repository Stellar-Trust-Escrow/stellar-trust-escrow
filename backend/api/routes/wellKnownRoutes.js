import express from 'express';
import keyRotationService from '../../services/keyRotationService.js';

const router = express.Router();

router.get('/jwks.json', async (req, res) => {
  try {
    const keys = await keyRotationService.getValidPublicKeys(true);
    res.json({ keys });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
