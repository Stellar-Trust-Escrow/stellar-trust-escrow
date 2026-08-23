import express from 'express';
import multer from 'multer';
import { uploadDocument, downloadDocument, getEscrowDocuments } from '../../services/documentService.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    const { escrowId } = req.body;
    const result = await uploadDocument({
      file: req.file.buffer,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      escrowId,
    });
    res.status(201).json(result);
  } catch (err) {
    if (err.message.includes('10MB')) return res.status(413).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.get('/escrow/:escrowId', (req, res) => {
  try {
    res.json(getEscrowDocuments(req.params.escrowId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:cid', async (req, res) => {
  try {
    const { encryptionKey, iv, authTag } = req.query;
    if (!encryptionKey || !iv || !authTag) {
      return res.status(400).json({ error: 'encryptionKey, iv, and authTag are required' });
    }
    const buf = await downloadDocument({ cid: req.params.cid, encryptionKey, iv, authTag });
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
