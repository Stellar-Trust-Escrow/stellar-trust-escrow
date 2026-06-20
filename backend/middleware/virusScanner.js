/**
 * Virus Scanner Middleware
 *
 * Intercepts file uploads and scans them for malicious content using ClamAV.
 * Files are written to a temporary secure directory, scanned, and immediately
 * deleted regardless of outcome.
 *
 * On threat detection:
 *  - Blocks the request with a security error response
 *  - Logs an account warning for compliance review
 *  - Prevents the file from being pinned to IPFS
 *
 * On clean scan:
 *  - Allows the request to continue to the IPFS pinning step
 *  - Records scan status for audit trail
 */

import virusScanner from '../services/virusScanner.js';
import { createModuleLogger } from '../config/logger.js';
import prisma from '../lib/prisma.js';

const logger = createModuleLogger('middleware.virusScanner');

const SCAN_TIMEOUT_MS = parseInt(process.env.SCAN_TIMEOUT_MS || '30000', 10);
const MAX_SCAN_FILE_SIZE = parseInt(process.env.MAX_SCAN_FILE_SIZE || String(10 * 1024 * 1024), 10);

/**
 * Log a security warning for account review when infected content is detected.
 * Captures file details, user info, and scanning results for compliance audit.
 */
async function logAccountWarning(userId, tenantId, infectedFiles) {
  try {
    if (!userId || !tenantId) {
      logger.warn({
        message: 'account_warning_missing_context',
        infectedFiles: infectedFiles.map((f) => ({
          filename: f.originalname,
          viruses: f.viruses || [],
        })),
      });
      return;
    }

    const warningDetails = {
      type: 'MALWARE_DETECTION',
      severity: 'HIGH',
      userId,
      tenantId,
      timestamp: new Date().toISOString(),
      infectedCount: infectedFiles.length,
      detectedThreats: infectedFiles.map((f) => ({
        filename: f.originalname,
        viruses: f.viruses || [],
        detectionReason: f.reason,
      })),
    };

    logger.warn({
      message: 'account_warning_malware_detected',
      ...warningDetails,
    });

    // Optional: Write to audit log table if available
    try {
      await prisma.auditLog?.create({
        data: {
          userId,
          tenantId,
          action: 'MALWARE_UPLOAD_ATTEMPTED',
          details: warningDetails,
          severity: 'HIGH',
        },
      });
    } catch (dbError) {
      logger.error({
        message: 'failed_to_log_audit_entry',
        error: dbError.message,
        userId,
        tenantId,
      });
    }
  } catch (error) {
    logger.error({
      message: 'failed_to_log_account_warning',
      error: error.message,
      stack: error.stack,
    });
  }
}

/**
 * Middleware: scan uploaded files for viruses.
 * Returns 400 if any file is infected; otherwise passes scan results to next handler.
 */
export default async function virusScanMiddleware(req, res, next) {
  // Skip if no files uploaded
  if (!req.files || req.files.length === 0) {
    return next();
  }

  const userId = req.user?.userId;
  const tenantId = req.tenant?.id;

  try {
    // Scan each file in parallel, respecting size limits
    const scanResults = await Promise.all(
      req.files.map(async (file) => {
        // Skip very large files from scanning (they were already size-checked by multer)
        if (file.size > MAX_SCAN_FILE_SIZE) {
          logger.warn({
            message: 'scan_skipped_file_too_large',
            filename: file.originalname,
            size: file.size,
            maxSize: MAX_SCAN_FILE_SIZE,
          });
          return {
            fieldname: file.fieldname,
            originalname: file.originalname,
            isInfected: false,
            status: 'skipped',
            reason: 'File exceeds scan size limit',
            viruses: [],
          };
        }

        return {
          fieldname: file.fieldname,
          originalname: file.originalname,
          ...(await virusScanner.quickScan(file.buffer, file.originalname)),
        };
      }),
    );

    // Separate infected from clean files
    const infectedFiles = scanResults.filter((r) => r.isInfected);

    // If any files are infected, block the request and log account warning
    if (infectedFiles.length > 0) {
      // Log security warning for compliance review
      await logAccountWarning(userId, tenantId, infectedFiles);

      logger.warn({
        message: 'malware_detected_upload_blocked',
        userId,
        tenantId,
        infectedCount: infectedFiles.length,
        filenames: infectedFiles.map((f) => f.originalname),
      });

      return res.status(400).json({
        error: 'Virus detected',
        message: `Malicious content found in: ${infectedFiles.map((f) => f.originalname).join(', ')}`,
        infectedFiles: infectedFiles.map((f) => ({
          filename: f.originalname,
          viruses: f.viruses || [],
          detectionReason: f.reason,
        })),
      });
    }

    // Log successful scan results for audit trail
    logger.info({
      message: 'files_scanned_clean',
      userId,
      tenantId,
      fileCount: req.files.length,
      filenames: req.files.map((f) => f.originalname),
      scanResults: scanResults.map((r) => ({
        filename: r.originalname,
        status: r.status,
      })),
    });

    // Attach scan results to request for downstream handlers
    req.virusScanResults = scanResults;
    next();
  } catch (error) {
    logger.error({
      message: 'virus_scan_error',
      userId,
      tenantId,
      error: error.message,
      stack: error.stack,
    });

    // On scan error, block upload to be safe
    return res.status(500).json({
      error: 'Virus scan failed',
      message: 'Unable to complete virus scan. Upload blocked for security.',
    });
  }
}
