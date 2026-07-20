import fs from 'fs';

import { validationResult } from 'express-validator';

import exportService from '../../services/exportService.js';

const LARGE_EXPORT_LIMIT_BYTES = 10 * 1024 * 1024;
const VALID_EXPORT_FORMATS = ['csv', 'xlsx'];
const VALID_ESCROW_STATUSES = ['Active', 'Completed', 'Disputed', 'Cancelled'];

/**
 * Export Controller
 * Handles data export/import endpoints for user data portability
 */

/**
 * Export all user data
 * @route GET /api/users/:address/export
 */
const exportUserData = async (req, res) => {
  try {
    const { address } = req.params;

    // Validate address format (Stellar addresses start with G)
    if (!address || !address.startsWith('G')) {
      return res.status(400).json({
        error: 'Invalid Stellar address format',
      });
    }

    if (req.user?.address !== address && !req.isAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const tenantId = req.tenant?.id;
    const data = await exportService.exportUserData(address, { tenantId });
    const fileContent = exportService.generateExportFile(data);

    if (req.isAdmin) {
      await exportService.logAdminExport(address, {
        tenantId,
        performedBy: req.adminId ?? req.user?.address ?? 'admin',
      });
    }

    if (Buffer.byteLength(fileContent, 'utf8') > LARGE_EXPORT_LIMIT_BYTES) {
      const queued = await exportService.queueLargeExport(address, {
        tenantId,
        requestedBy: req.user?.address,
      });
      return res.status(202).json({
        status: 'queued',
        message: 'Export is larger than 10MB and will be delivered by email.',
        jobId: queued.jobId,
      });
    }

    res.json(data);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      error: 'Failed to export user data',
    });
  }
};

/**
 * Import user data
 * @route POST /api/users/:address/import
 */
const importUserData = async (req, res) => {
  try {
    const { address } = req.params;
    const { data, mode = 'merge' } = req.body;

    // Validate address format
    if (!address || !address.startsWith('G')) {
      return res.status(400).json({
        error: 'Invalid Stellar address format',
      });
    }

    if (req.user?.address !== address) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Validate import data
    if (!data) {
      return res.status(400).json({
        error: 'Missing data to import',
      });
    }

    // Validate the data structure
    const validation = exportService.validateImportData(data);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Invalid data format',
        details: validation.errors,
      });
    }

    // Merge import data
    const results = await exportService.mergeImportData(address, data, mode);

    res.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({
      error: 'Failed to import user data',
    });
  }
};

/**
 * Download export as file
 * @route GET /api/users/:address/export/file
 */
const downloadExportFile = async (req, res) => {
  try {
    const { address } = req.params;

    // Validate address format
    if (!address || !address.startsWith('G')) {
      return res.status(400).json({
        error: 'Invalid Stellar address format',
      });
    }

    if (req.user?.address !== address && !req.isAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const tenantId = req.tenant?.id;
    const data = await exportService.exportUserData(address, { tenantId });
    const fileContent = exportService.generateExportFile(data);

    if (req.isAdmin) {
      await exportService.logAdminExport(address, {
        tenantId,
        performedBy: req.adminId ?? req.user?.address ?? 'admin',
      });
    }

    if (Buffer.byteLength(fileContent, 'utf8') > LARGE_EXPORT_LIMIT_BYTES) {
      const queued = await exportService.queueLargeExport(address, {
        tenantId,
        requestedBy: req.user?.address,
      });
      return res.status(202).json({
        status: 'queued',
        message: 'Export is larger than 10MB and will be delivered by email.',
        jobId: queued.jobId,
      });
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="stellar-trust-export-${address}.json"`,
    );
    res.send(fileContent);
  } catch (error) {
    console.error('Download export error:', error);
    res.status(500).json({
      error: 'Failed to generate export file',
    });
  }
};

/**
 * Pseudonymize user data
 * @route DELETE /api/users/:address/data
 */
const deleteUserData = async (req, res) => {
  try {
    const { address } = req.params;

    if (!address || !address.startsWith('G')) {
      return res.status(400).json({
        error: 'Invalid Stellar address format',
      });
    }

    const result = await exportService.pseudonymizeUserData(address, {
      tenantId: req.tenant?.id,
      performedBy: req.adminId ?? 'admin',
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('GDPR deletion error:', error);
    res.status(500).json({
      error: 'Failed to pseudonymize user data',
    });
  }
};

/**
 * Create an async escrow-history export job.
 * @route POST /api/v1/escrows/export
 */
const createEscrowExport = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid export request', details: errors.array() });
  }

  try {
    const { format, dateFrom, dateTo, status } = req.body;

    const { jobId, estimatedSeconds } = await exportService.createExportJob({
      format,
      dateFrom,
      dateTo,
      status,
      tenantId: req.tenant?.id,
      requestedBy: req.user?.address,
    });

    return res.status(202).json({ jobId, estimatedSeconds });
  } catch (error) {
    console.error('Create escrow export error:', error);
    return res.status(500).json({ error: 'Failed to queue export job' });
  }
};

/**
 * Poll an escrow export job's status.
 * @route GET /api/v1/escrows/export/:jobId/status
 */
const getEscrowExportStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await exportService.getJobStatus(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Export job not found or expired' });
    }

    return res.json({
      status: job.status,
      progress: job.progress ?? 0,
      ...(job.downloadUrl ? { downloadUrl: job.downloadUrl } : {}),
      ...(job.error ? { error: job.error } : {}),
    });
  } catch (error) {
    console.error('Get escrow export status error:', error);
    return res.status(500).json({ error: 'Failed to fetch export status' });
  }
};

/**
 * Download a completed export via a locally-signed, short-lived URL.
 * Auth is provided by the HMAC signature + expiry, so this route is public.
 * @route GET /api/v1/escrows/export/:jobId/download
 */
const downloadEscrowExport = async (req, res) => {
  try {
    const { jobId } = req.params;
    const { expires, signature } = req.query;

    const check = exportService.verifyDownloadSignature(jobId, expires, signature);
    if (!check.valid) {
      const code = check.reason === 'expired' ? 410 : 403;
      return res.status(code).json({ error: `Download link ${check.reason}` });
    }

    const job = await exportService.getJobStatus(jobId);
    if (!job || job.status !== 'done' || !job.filePath) {
      return res.status(404).json({ error: 'Export not available' });
    }

    if (!fs.existsSync(job.filePath)) {
      return res.status(404).json({ error: 'Export file no longer available' });
    }

    res.setHeader('Content-Type', exportService.contentTypeFor(job.format));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${job.filename || `escrow-export-${jobId}.${job.format}`}"`,
    );

    const stream = fs.createReadStream(job.filePath);
    stream.on('error', () => {
      if (!res.headersSent) res.status(500).json({ error: 'Failed to stream export file' });
    });
    stream.pipe(res);
  } catch (error) {
    console.error('Download escrow export error:', error);
    return res.status(500).json({ error: 'Failed to download export' });
  }
};

export { VALID_EXPORT_FORMATS, VALID_ESCROW_STATUSES };

export default {
  exportUserData,
  importUserData,
  downloadExportFile,
  deleteUserData,
  createEscrowExport,
  getEscrowExportStatus,
  downloadEscrowExport,
};
