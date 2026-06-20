import { jest } from '@jest/globals';
import sharp from 'sharp';

const ipfsServiceMock = {
  pinFile: jest.fn(),
};

jest.unstable_mockModule('../services/ipfsService.js', () => ({ default: ipfsServiceMock }));
jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => ({
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  }),
}));

const { default: mediaTranscoder } = await import('../services/mediaTranscoder.js');

describe('Media Transcoder Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ipfsServiceMock.pinFile.mockResolvedValue({ cid: 'QmTranscoded', size: 50000 });
  });

  describe('isImage', () => {
    it('identifies image by mime type', () => {
      expect(mediaTranscoder.isImage('image/jpeg', Buffer.from(''))).toBe(true);
      expect(mediaTranscoder.isImage('image/png', Buffer.from(''))).toBe(true);
      expect(mediaTranscoder.isImage('image/webp', Buffer.from(''))).toBe(true);
      expect(mediaTranscoder.isImage('application/pdf', Buffer.from(''))).toBe(false);
    });

    it('identifies image by magic bytes', () => {
      // JPEG magic: FF D8
      const jpegMagic = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      expect(mediaTranscoder.isImage('application/octet-stream', jpegMagic)).toBe(true);

      // PNG magic: 89 50 4E 47
      const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      expect(mediaTranscoder.isImage('application/octet-stream', pngMagic)).toBe(true);

      // GIF magic: 47 49 46
      const gifMagic = Buffer.from([0x47, 0x49, 0x46, 0x38]);
      expect(mediaTranscoder.isImage('application/octet-stream', gifMagic)).toBe(true);
    });

    it('rejects non-image files', () => {
      expect(mediaTranscoder.isImage('video/mp4', Buffer.from(''))).toBe(false);
      expect(mediaTranscoder.isImage('text/plain', Buffer.from(''))).toBe(false);
      expect(mediaTranscoder.isImage('application/zip', Buffer.from(''))).toBe(false);
    });
  });

  describe('transcodeImage', () => {
    it('transcodes JPEG to WebP', async () => {
      // Create a minimal 100x100 JPEG buffer
      const jpegBuffer = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } },
      })
        .jpeg({ quality: 85 })
        .toBuffer();

      const result = await mediaTranscoder.transcodeImage(jpegBuffer, 'test.jpg');

      expect(result).toBeTruthy();
      expect(result.length).toBeLessThan(jpegBuffer.length); // Should be compressed
      expect(result).toBeInstanceOf(Buffer);
    });

    it('transcodes PNG to WebP', async () => {
      const pngBuffer = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        },
      })
        .png()
        .toBuffer();

      const result = await mediaTranscoder.transcodeImage(pngBuffer, 'test.png');

      expect(result).toBeTruthy();
      expect(result).toBeInstanceOf(Buffer);
    });

    it('transcodes GIF to WebP', async () => {
      // Create a minimal GIF-like buffer (this will fail gracefully in practice)
      const gifBuffer = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 255, b: 0 } },
      })
        .toFormat('gif')
        .toBuffer();

      const result = await mediaTranscoder.transcodeImage(gifBuffer, 'test.gif');

      expect(result).toBeTruthy();
      expect(result).toBeInstanceOf(Buffer);
    });

    it('respects max file size for transcoding', async () => {
      const oversizedBuffer = Buffer.alloc(51 * 1024 * 1024); // Exceeds default 50MB limit
      const result = await mediaTranscoder.transcodeImage(oversizedBuffer, 'huge.jpg');

      expect(result).toBeNull();
    });

    it('handles transcode errors gracefully', async () => {
      const result = await mediaTranscoder.transcodeImage(Buffer.from('invalid'), 'corrupted.jpg');

      expect(result).toBeNull();
    });
  });

  describe('generateThumbnail', () => {
    it('generates thumbnail at expected dimensions', async () => {
      // Create a large 2000x2000 image
      const largeBuffer = await sharp({
        create: { width: 2000, height: 2000, channels: 3, background: { r: 100, g: 100, b: 100 } },
      })
        .jpeg({ quality: 85 })
        .toBuffer();

      const result = await mediaTranscoder.generateThumbnail(largeBuffer, 'large.jpg');

      expect(result).toBeTruthy();
      expect(result).toBeInstanceOf(Buffer);

      // Verify thumbnail dimensions
      const metadata = await sharp(result).metadata();
      expect(metadata.width).toBeLessThanOrEqual(300);
      expect(metadata.height).toBeLessThanOrEqual(300);
    });

    it('handles thumbnail generation errors', async () => {
      const result = await mediaTranscoder.generateThumbnail(Buffer.from('invalid'), 'bad.jpg');

      expect(result).toBeNull();
    });
  });

  describe('transcodeImageFile', () => {
    it('transcodes and pins image successfully', async () => {
      const imageBuffer = await sharp({
        create: { width: 500, height: 500, channels: 3, background: { r: 200, g: 100, b: 50 } },
      })
        .jpeg({ quality: 85 })
        .toBuffer();

      ipfsServiceMock.pinFile
        .mockResolvedValueOnce({ cid: 'QmTranscoded123', size: 30000 })
        .mockResolvedValueOnce({ cid: 'QmThumb456', size: 5000 });

      const result = await mediaTranscoder.transcodeImageFile(imageBuffer, 'test.jpg');

      expect(result.status).toBe('success');
      expect(result.assetCid).toBe('QmTranscoded123');
      expect(result.thumbnailCid).toBe('QmThumb456');
      expect(ipfsServiceMock.pinFile).toHaveBeenCalledTimes(2);
    });

    it('returns error when both transcode and thumbnail fail', async () => {
      const result = await mediaTranscoder.transcodeImageFile(Buffer.from('invalid'), 'bad.jpg');

      expect(result.status).toBe('failed');
    });

    it('returns error on IPFS pin failure', async () => {
      const imageBuffer = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 50, g: 150, b: 250 } },
      })
        .jpeg({ quality: 85 })
        .toBuffer();

      ipfsServiceMock.pinFile.mockRejectedValueOnce(new Error('IPFS unavailable'));

      const result = await mediaTranscoder.transcodeImageFile(imageBuffer, 'test.jpg');

      expect(result.status).toBe('error');
    });
  });

  describe('transcodeAsync', () => {
    it('does not block event loop during transcoding', async () => {
      const imageBuffer = await sharp({
        create: { width: 300, height: 300, channels: 3, background: { r: 75, g: 175, b: 200 } },
      })
        .jpeg({ quality: 85 })
        .toBuffer();

      const attachment = {
        filename: 'async_test.jpg',
        mimeType: 'image/jpeg',
        buffer: imageBuffer,
      };

      const startTime = Date.now();

      // This should return immediately (promise resolves in background)
      const promise = mediaTranscoder.transcodeAsync(attachment, 'QmOriginal');

      const immediateTime = Date.now();
      expect(immediateTime - startTime).toBeLessThan(100); // Should be nearly instant

      // Wait for actual transcoding to complete
      const result = await promise;
      expect(result).toHaveProperty('status');
    });

    it('skips transcoding for non-image files', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4\n%mock');

      const attachment = {
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        buffer: pdfBuffer,
      };

      const result = await mediaTranscoder.transcodeAsync(attachment, 'QmPdf');

      expect(result.status).toBe('skipped');
    });

    it('handles large files gracefully during async transcoding', async () => {
      const oversizedBuffer = Buffer.alloc(50 * 1024 * 1024 + 1);

      const attachment = {
        filename: 'oversized.jpg',
        mimeType: 'image/jpeg',
        buffer: oversizedBuffer,
      };

      // Should not throw; should handle gracefully
      const result = await mediaTranscoder.transcodeAsync(attachment, 'QmOversized');

      // Result should indicate what happened
      expect(result).toHaveProperty('status');
    });
  });

  describe('updatePayloadWithTranscodedCid', () => {
    it('updates payload with transcoded CID on success', () => {
      const payload = {
        chatId: 'chat123',
        attachment: {
          cid: 'QmOriginal',
          filename: 'image.jpg',
        },
      };

      const transcodeResult = {
        status: 'success',
        assetCid: 'QmTranscoded789',
        thumbnailCid: 'QmThumb999',
      };

      const updated = mediaTranscoder.updatePayloadWithTranscodedCid(payload, transcodeResult);

      expect(updated.attachment.originalCid).toBe('QmOriginal');
      expect(updated.attachment.transcodedCid).toBe('QmTranscoded789');
      expect(updated.attachment.thumbnailCid).toBe('QmThumb999');
      expect(updated.attachment.transcodeStatus).toBe('complete');
    });

    it('preserves payload on transcode failure', () => {
      const payload = {
        chatId: 'chat123',
        attachment: {
          cid: 'QmOriginal',
          filename: 'image.jpg',
        },
      };

      const transcodeResult = {
        status: 'failed',
        reason: 'Transcoding failed',
      };

      const updated = mediaTranscoder.updatePayloadWithTranscodedCid(payload, transcodeResult);

      expect(updated).toEqual(payload); // Unchanged
    });
  });

  describe('latency for files under 10MB', () => {
    it('completes transcoding quickly for small files', async () => {
      // Create a 5MB image
      const largeBuffer = await sharp({
        create: { width: 1000, height: 1000, channels: 3, background: { r: 123, g: 45, b: 67 } },
      })
        .jpeg({ quality: 75 })
        .toBuffer();

      const attachment = {
        filename: 'medium.jpg',
        mimeType: 'image/jpeg',
        buffer: largeBuffer.subarray(0, Math.min(largeBuffer.length, 5 * 1024 * 1024)),
      };

      const startTime = Date.now();
      const result = await mediaTranscoder.transcodeAsync(attachment, 'QmMedium');
      const duration = Date.now() - startTime;

      // Should complete within reasonable time (10 seconds for a small file)
      expect(duration).toBeLessThan(10000);
      expect(result).toHaveProperty('status');
    });
  });
});
