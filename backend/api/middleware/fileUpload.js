import multer from 'multer';
import path from 'path';
import prisma from '../../lib/prisma.js';
import virusScanner from '../../services/virusScanner.js';
import ipfsService from '../../services/ipfsService.js';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;

const storage = multer.memoryStorage();

const fileFilter = async (req, file, cb) => {
  try {
    if (!file.originalname) {
      return cb(new Error('Filename is required'), false);
    }

    const allowedMimeTypes = [
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
      'application/zip'
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error(`File type ${file.mimetype} is not allowed`), false);
    }

    if (file.size > MAX_FILE_SIZE) {
      return cb(new Error('File size exceeds 10MB limit'), false);
    }

    cb(null, true);
  } catch (error) {
    cb(error, false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES
  },
  fileFilter
});

const virusScanMiddleware = async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return next();
  }

  try {
    const scanResults = await Promise.all(
      req.files.map(async (file) => {
        const scanResult = await virusScanner.quickScan(file.buffer, file.originalname);
        return {
          fieldname: file.fieldname,
          originalname: file.originalname,
          ...scanResult
        };
      })
    );

    const infectedFiles = scanResults.filter(result => result.isInfected);
    
    if (infectedFiles.length > 0) {
      const infectedNames = infectedFiles.map(f => f.originalname).join(', ');
      return res.status(400).json({
        error: 'Virus detected',
        message: `Malicious content found in: ${infectedNames}`,
        infectedFiles: infectedFiles.map(f => ({
          filename: f.originalname,
          viruses: f.viruses
        }))
      });
    }

    req.virusScanResults = scanResults;
    next();
  } catch (error) {
    console.error('Virus scan error:', error);
    res.status(500).json({
      error: 'Virus scan failed',
      message: 'Unable to complete virus scan'
    });
  }
};

const ipfsUploadMiddleware = async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return next();
  }

  try {
    const uploadResults = await Promise.all(
      req.files.map(async (file) => {
        const ipfsResult = await ipfsService.pinFile(file.buffer);
        
        let thumbnailResult = null;
        if (ipfsService.isImage(file.mimetype)) {
          const thumbnailBuffer = await ipfsService.generateThumbnail(file.buffer, file.mimetype);
          if (thumbnailBuffer) {
            thumbnailResult = await ipfsService.pinFile(thumbnailBuffer);
          }
        }

        const metadata = await ipfsService.getFileMetadata(file.buffer, file.originalname, file.mimetype);

        return {
          fieldname: file.fieldname,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          ipfsCid: ipfsResult.cid,
          thumbnailCid: thumbnailResult?.cid || null,
          metadata
        };
      })
    );

    req.ipfsUploadResults = uploadResults;
    next();
  } catch (error) {
    console.error('IPFS upload error:', error);
    res.status(500).json({
      error: 'IPFS upload failed',
      message: 'Unable to upload files to IPFS'
    });
  }
};

const validateDisputeAccess = async (req, res, next) => {
  const { id } = req.params;
  const userAddress = req.user?.address;

  if (!userAddress) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  try {
    const dispute = await prisma.dispute.findFirst({
      where: {
        id: parseInt(id),
        tenantId: req.tenant.id
      },
      include: {
        escrow: true
      }
    });

    if (!dispute) {
      return res.status(404).json({ error: 'Dispute not found' });
    }

    const isParticipant = 
      dispute.raisedByAddress === userAddress ||
      dispute.escrow.clientAddress === userAddress ||
      dispute.escrow.freelancerAddress === userAddress;

    const isAdmin = req.user?.role === 'admin' || req.user?.role === 'arbiter';

    if (!isParticipant && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    req.dispute = dispute;
    next();
  } catch (error) {
    console.error('Dispute access validation error:', error);
    res.status(500).json({ error: 'Validation failed' });
  }
};

export const uploadEvidence = [
  upload.array('files', MAX_FILES),
  virusScanMiddleware,
  ipfsUploadMiddleware,
  validateDisputeAccess
];

export const uploadSingleFile = upload.single('file');
export const uploadMultipleFiles = upload.array('files', MAX_FILES);
