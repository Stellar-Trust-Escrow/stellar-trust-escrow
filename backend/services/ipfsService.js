import sharp from 'sharp';

const GATEWAY = process.env.IPFS_GATEWAY_URL || 'https://ipfs.io';
const API_URL = process.env.IPFS_API_URL || 'https://api.thegraph.com/ipfs/api/v0';

class IPFSService {
  /**
   * Pin a buffer to IPFS via the HTTP API.
   * Returns { cid, size }.
   */
  async pinFile(buffer) {
    const form = new FormData();
    form.append('file', new Blob([buffer]));

    const res = await fetch(`${API_URL}/add?pin=true`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      throw new Error(`IPFS add failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    return { cid: data.Hash, size: data.Size };
  }

  async generateThumbnail(buffer, mimeType) {
    if (!this.isImage(mimeType)) return null;
    try {
      return await sharp(buffer)
        .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch {
      return null;
    }
  }

  getFileUrl(cid) {
    return `${GATEWAY}/ipfs/${cid}`;
  }

  isImage(mimeType) {
    return typeof mimeType === 'string' && mimeType.startsWith('image/');
  }

  sanitizeFilename(filename) {
    if (!filename) return 'unknown';
    return filename.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 255) || 'unknown';
  }

  async getFileMetadata(buffer, filename, mimeType) {
    const metadata = {
      filename: this.sanitizeFilename(filename),
      mimeType: mimeType || 'application/octet-stream',
      fileSize: buffer.length,
      uploadedAt: new Date().toISOString(),
    };

    if (this.isImage(mimeType)) {
      try {
        const info = await sharp(buffer).metadata();
        metadata.width = info.width;
        metadata.height = info.height;
        metadata.format = info.format;
      } catch { /* non-fatal */ }
    }

    return metadata;
  }
}

export default new IPFSService();
