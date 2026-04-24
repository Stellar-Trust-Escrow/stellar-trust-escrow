import multer from 'multer';
import prisma from '../../lib/prisma.js';
import virusScanner from '../../services/virusScanner.js';
import ipfsService from '../../services/ipfsService.js';
import { broadcastToDispute } from '../websocket/handlers.js';

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || String(10 * 1024 * 1024), 10);
const MAX_FILES = parseInt(process.env.MAX_FILES || '5', 10);

const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/zip',
]);

const fileFilter = (_req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(Object.assign(new Error(`File type ${file.mimetype} is not allowed`), { code: 'LIMIT_FILE_TYPE' }), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  fileFilter,
});

/**
 * Express error handler for multer errors.
 * Must be used as the last middleware in the upload chain.
 */
export function handleUploadError(err, _req, res, next) {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit` });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ error: `Too many files. Maximum is ${MAX_FILES}` });
  }
  if (err.code === 'LIMIT_FILE_TYPE') {
    return res.status(400).json({ error: err.message });
  }
  next(err);
}

const virusScanMiddleware = async (req, res, next) => {
  if (!req.files || req.files.length === 0) return next();

  try {
    const scanResults = await Promise.all(
      req.files.map(async (file) => {
        const scanResult = await virusScanner.quickScan(file.buffer, file.originalname);
        return { fieldname: file.fieldname, originalname: file.originalname, ...scanResult };
      })
    );

    const infectedFiles = scanResults.filter((r) => r.isInfected);
    if (infectedFiles.length > 0) {
      return res.status(400).json({
        error: 'Virus detected',
        message: `Malicious content found in: ${infectedFiles.map((f) => f.originalname).join(', ')}`,
        infectedFiles: infectedFiles.map((f) => ({ filename: f.originalname, viruses: f.viruses })),
      });
    }

    req.virusScanResults = scanResults;
    next();
  } catch (error) {
    console.error('Virus scan error:', error);
    res.status(500).json({ error: 'Virus scan failed', message: 'Unable to complete virus scan' });
  }
};

const ipfsUploadMiddleware = async (req, res, next) => {
  if (!req.files || req.files.length === 0) return next();

  const disputeId = req.dispute?.id;

  try {
    const uploadResults = await Promise.all(
      req.files.map(async (file, index) => {
        // Broadcast per-file progress via WebSocket
        if (disputeId) {
          broadcastToDispute(disputeId, {
            type: 'upload_progress',
            filename: file.originalname,
            index,
            total: req.files.length,
          });
        }

        const ipfsResult = await ipfsService.pinFile(file.buffer);

        let thumbnailCid = null;
        if (ipfsService.isImage(file.mimetype)) {
          const thumbnailBuffer = await ipfsService.generateThumbnail(file.buffer, file.mimetype);
          if (thumbnailBuffer) {
            const thumbResult = await ipfsService.pinFile(thumbnailBuffer);
            thumbnailCid = thumbResult.cid;
          }
        }

        const metadata = await ipfsService.getFileMetadata(file.buffer, file.originalname, file.mimetype);

        return {
          fieldname: file.fieldname,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          ipfsCid: ipfsResult.cid,
          thumbnailCid,
          metadata,
        };
      })
    );

    req.ipfsUploadResults = uploadResults;
    next();
  } catch (error) {
    console.error('IPFS upload error:', error);
    res.status(500).json({ error: 'IPFS upload failed', message: 'Unable to upload files to IPFS' });
  }
};

const validateDisputeAccess = async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user?.userId;

  if (!userId) return res.status(401).json({ error: 'User not authenticated' });

  try {
    // Resolve wallet address from DB — JWT payload only carries userId
    const userProfile = await prisma.userProfile.findFirst({
      where: { userId },
      select: { walletAddress: true },
    });
    const userAddress = userProfile?.walletAddress ?? null;

    const dispute = await prisma.dispute.findFirst({
      where: { id: parseInt(id), tenantId: req.tenant.id },
      include: { escrow: true },
    });

    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

    const isParticipant =
      (userAddress && (
        dispute.raisedByAddress === userAddress ||
        dispute.escrow.clientAddress === userAddress ||
        dispute.escrow.freelancerAddress === userAddress
      ));
    const isAdmin = req.user?.role === 'admin' || req.user?.role === 'arbiter';

    if (!isParticipant && !isAdmin) return res.status(403).json({ error: 'Access denied' });

    req.dispute = dispute;
    req.userAddress = userAddress;
    next();
  } catch (error) {
    console.error('Dispute access validation error:', error);
    res.status(500).json({ error: 'Validation failed' });
  }
};

export const uploadEvidence = [
  upload.array('files', MAX_FILES),
  handleUploadError,
  validateDisputeAccess,
  virusScanMiddleware,
  ipfsUploadMiddleware,
];

export const uploadSingleFile = upload.single('file');
export const uploadMultipleFiles = upload.array('files', MAX_FILES);
