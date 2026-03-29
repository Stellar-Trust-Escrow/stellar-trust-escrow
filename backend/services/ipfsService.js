import { create } from 'ipfs-http-client';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

class IPFSService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.init();
  }

  async init() {
    try {
      const ipfsGateway = process.env.IPFS_GATEWAY_URL || 'https://ipfs.io';
      const ipfsApi = process.env.IPFS_API_URL || 'https://api.thegraph.com/ipfs/api/v0';
      
      this.client = create({
        url: ipfsApi,
        timeout: 30000,
        headers: {
          'User-Agent': 'StellarTrustEscrow/1.0.0'
        }
      });

      this.isConnected = true;
      console.log('IPFS client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize IPFS client:', error);
      this.isConnected = false;
    }
  }

  async pinFile(buffer, options = {}) {
    if (!this.isConnected) {
      throw new Error('IPFS client not connected');
    }

    try {
      const result = await this.client.add(buffer, {
        pin: true,
        timeout: 60000,
        ...options
      });

      return {
        cid: result.cid.toString(),
        size: result.size,
        path: result.path
      };
    } catch (error) {
      console.error('Error pinning file to IPFS:', error);
      throw new Error(`Failed to pin file to IPFS: ${error.message}`);
    }
  }

  async generateThumbnail(buffer, mimeType) {
    if (!mimeType.startsWith('image/')) {
      return null;
    }

    try {
      const thumbnail = await sharp(buffer)
        .resize(300, 300, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      return thumbnail;
    } catch (error) {
      console.error('Error generating thumbnail:', error);
      return null;
    }
  }

  async getFileUrl(cid) {
    const gateway = process.env.IPFS_GATEWAY_URL || 'https://ipfs.io';
    return `${gateway}/ipfs/${cid}`;
  }

  async unpinFile(cid) {
    if (!this.isConnected) {
      throw new Error('IPFS client not connected');
    }

    try {
      await this.client.pin.rm(cid);
      return true;
    } catch (error) {
      console.error('Error unpinning file from IPFS:', error);
      return false;
    }
  }

  isImage(mimeType) {
    return mimeType && mimeType.startsWith('image/');
  }

  isValidFileSize(size, maxSize = 10 * 1024 * 1024) {
    return size <= maxSize;
  }

  sanitizeFilename(filename) {
    if (!filename) return 'unknown';
    
    const sanitized = filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 255);
    
    return sanitized || 'unknown';
  }

  async getFileMetadata(buffer, filename, mimeType) {
    const metadata = {
      filename: this.sanitizeFilename(filename),
      mimeType: mimeType || 'application/octet-stream',
      fileSize: buffer.length,
      uploadedAt: new Date().toISOString()
    };

    if (this.isImage(mimeType)) {
      try {
        const imageInfo = await sharp(buffer).metadata();
        metadata.width = imageInfo.width;
        metadata.height = imageInfo.height;
        metadata.format = imageInfo.format;
      } catch (error) {
        console.warn('Could not extract image metadata:', error);
      }
    }

    return metadata;
  }
}

export default new IPFSService();
