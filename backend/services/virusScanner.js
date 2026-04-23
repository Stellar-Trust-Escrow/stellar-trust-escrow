import NodeClam from 'clamscan';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

class VirusScanner {
  constructor() {
    this.clamscan = null;
    this.initialized = false;
    this.init();
  }

  async init() {
    try {
      this.clamscan = await new NodeClam().init({
        clamdscan: {
          host: process.env.CLAMAV_HOST || 'localhost',
          port: parseInt(process.env.CLAMAV_PORT) || 3310,
          timeout: 30000,
          local_fallback: false
        },
        preference: 'clamdscan'
      });

      this.initialized = true;
      console.log('Virus scanner initialized successfully');
    } catch (error) {
      console.warn('Failed to initialize virus scanner:', error);
      this.initialized = false;
    }
  }

  async scanFile(buffer, filename) {
    if (!this.initialized) {
      console.warn('Virus scanner not initialized, skipping scan');
      return {
        isInfected: false,
        status: 'skipped',
        reason: 'Scanner not available'
      };
    }

    const tempDir = '/tmp';
    const tempFilename = `${uuidv4()}_${filename || 'scan'}`;
    const tempPath = path.join(tempDir, tempFilename);

    try {
      await fs.writeFile(tempPath, buffer);

      const scanResult = await this.clamscan.scanFile(tempPath);
      
      await fs.unlink(tempPath);

      if (scanResult.isInfected) {
        return {
          isInfected: true,
          status: 'infected',
          viruses: scanResult.viruses || [],
          reason: 'Malicious content detected'
        };
      }

      return {
        isInfected: false,
        status: 'clean',
        reason: 'No threats detected'
      };

    } catch (error) {
      try {
        await fs.unlink(tempPath);
      } catch (cleanupError) {
        console.warn('Failed to cleanup temp file:', cleanupError);
      }

      if (error.message.includes('ECONNREFUSED') || error.message.includes('timeout')) {
        console.warn('Virus scanner unavailable, allowing upload:', error);
        return {
          isInfected: false,
          status: 'error',
          reason: 'Scanner unavailable'
        };
      }

      console.error('Error scanning file:', error);
      return {
        isInfected: false,
        status: 'error',
        reason: error.message
      };
    }
  }

  async scanBuffer(buffer, filename) {
    if (!buffer || buffer.length === 0) {
      return {
        isInfected: false,
        status: 'error',
        reason: 'Empty file'
      };
    }

    if (buffer.length > 10 * 1024 * 1024) {
      return {
        isInfected: false,
        status: 'skipped',
        reason: 'File too large for scanning'
      };
    }

    return await this.scanFile(buffer, filename);
  }

  isEICAR(buffer) {
    const eicarSignature = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
    const bufferString = buffer.toString('ascii', 0, Math.min(buffer.length, eicarSignature.length));
    return bufferString.includes(eicarSignature);
  }

  async quickScan(buffer, filename) {
    if (this.isEICAR(buffer)) {
      return {
        isInfected: true,
        status: 'infected',
        viruses: ['EICAR-Test-File'],
        reason: 'EICAR test signature detected'
      };
    }

    return await this.scanBuffer(buffer, filename);
  }
}

export default new VirusScanner();
