import express from 'express';
import { getAuditLogs, verifySingleEntry, verifyAuditChain } from '../controllers/auditController.js';

const router = express.Router();

router.get('/', getAuditLogs);
router.get('/chain/verify', verifyAuditChain);
router.get('/:entryId/verify', verifySingleEntry);

export default router;
