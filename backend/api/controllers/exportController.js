import exportService from '../../services/exportService.js';

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

    const data = await exportService.exportUserData(address);

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

    const data = await exportService.exportUserData(address);
    const fileContent = exportService.generateExportFile(data);

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

export default {
  exportUserData,
  importUserData,
  downloadExportFile,
};
