/**
 * Compression Middleware
 *
 * Applies gzip and brotli compression to API responses.
 *
 * Strategy:
 *  - Brotli is preferred when the client advertises `br` in Accept-Encoding
 *    (better ratio, ~20-26% smaller than gzip on JSON payloads).
 *  - Falls back to gzip for all other clients.
 *  - Skips compression for small responses (< COMPRESSION_THRESHOLD bytes)
 *    to avoid CPU overhead with no meaningful size benefit.
 *  - Compression level is tunable via env vars so staging/prod can trade
 *    CPU for ratio independently.
 *
 * Env vars:
 *  COMPRESSION_LEVEL      gzip level 1-9  (default: 6)
 *  BROTLI_QUALITY         brotli quality 0-11 (default: 4)
 *  COMPRESSION_THRESHOLD  min bytes to compress (default: 1024)
 */

import zlib from 'zlib';
import compression from 'compression';
import { createModuleLogger } from '../config/logger.js';
import {
  compressionRatio,
  compressedResponsesTotal,
  compressionBytesTotal,
} from '../lib/metrics.js';

const compressionLog = createModuleLogger('middleware.compression');

const GZIP_LEVEL = parseInt(process.env.COMPRESSION_LEVEL || '6');
const BROTLI_QUALITY = parseInt(process.env.BROTLI_QUALITY || '4');
const THRESHOLD = parseInt(process.env.COMPRESSION_THRESHOLD || '1024');

/**
 * Decide whether to compress this response.
 * Skips: /metrics endpoint, already-compressed content types, small payloads.
 */
function shouldCompress(req, res) {
  // Never compress the Prometheus scrape endpoint
  if (req.path === '/metrics') return false;

  const contentType = res.getHeader('Content-Type') || '';
  // Skip already-compressed formats
  if (/image|audio|video|zip|gzip|br|compress/.test(contentType)) return false;

  return compression.filter(req, res);
}

/**
 * Wraps res.write / res.end to track original vs compressed byte counts
 * and emit Prometheus metrics on finish.
 */
function wrapResponseForMetrics(req, res) {
  let originalBytes = 0;
  let compressedBytes = 0;

  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);

  res.write = function (chunk, ...args) {
    if (chunk) originalBytes += Buffer.byteLength(chunk);
    return origWrite(chunk, ...args);
  };

  res.end = function (chunk, ...args) {
    if (chunk) originalBytes += Buffer.byteLength(chunk);
    return origEnd(chunk, ...args);
  };

  res.on('finish', () => {
    const encoding = res.getHeader('Content-Encoding');
    if (!encoding) return; // not compressed

    // Content-Length reflects compressed size after compression middleware runs
    const cl = res.getHeader('Content-Length');
    compressedBytes = cl ? parseInt(cl) : originalBytes;

    const algorithm = encoding === 'br' ? 'brotli' : encoding; // 'gzip' | 'deflate' | 'brotli'
    const route = req.route ? (req.baseUrl || '') + req.route.path : req.path;

    compressedResponsesTotal.inc({ algorithm, route });
    compressionBytesTotal.inc({ direction: 'original', algorithm }, originalBytes);
    compressionBytesTotal.inc({ direction: 'compressed', algorithm }, compressedBytes);

    if (originalBytes > 0) {
      compressionRatio.observe({ algorithm, route }, compressedBytes / originalBytes);
    }
  });
}

/**
 * Brotli compression middleware (manual, since `compression` package only
 * handles gzip/deflate natively).
 */
function brotliMiddleware(req, res, next) {
  const acceptEncoding = req.headers['accept-encoding'] || '';
  if (!acceptEncoding.includes('br')) return next();

  const contentLength = parseInt(res.getHeader('Content-Length') || '0');
  if (contentLength > 0 && contentLength < THRESHOLD) return next();

  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);

  const brotli = zlib.createBrotliCompress({
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY },
  });

  let headersSent = false;

  function patchHeaders() {
    if (headersSent) return;
    headersSent = true;
    res.setHeader('Content-Encoding', 'br');
    res.removeHeader('Content-Length'); // length changes after compression
    res.setHeader('Vary', 'Accept-Encoding');
  }

  res.write = function (chunk, encoding, callback) {
    patchHeaders();
    return brotli.write(chunk, encoding, callback);
  };

  res.end = function (chunk, encoding, callback) {
    patchHeaders();
    if (chunk) brotli.write(chunk, encoding);
    brotli.end();

    brotli.on('data', (compressed) => origWrite(compressed));
    brotli.on('end', () => origEnd(null, null, callback));
    brotli.on('error', (err) => {
      compressionLog.error({
        message: 'compression_brotli_error',
        error: err.message,
        stack: err.stack,
      });
      origEnd(chunk, encoding, callback);
    });
  };

  next();
}

/**
 * Gzip middleware via the `compression` package.
 */
const gzipMiddleware = compression({
  level: GZIP_LEVEL,
  threshold: THRESHOLD,
  filter: shouldCompress,
});

/**
 * Combined compression middleware.
 * Brotli is attempted first; if the client doesn't support it, gzip takes over.
 */
export default function compressionMiddleware(req, res, next) {
  wrapResponseForMetrics(req, res);

  const acceptEncoding = req.headers['accept-encoding'] || '';
  if (acceptEncoding.includes('br')) {
    return brotliMiddleware(req, res, next);
  }
  return gzipMiddleware(req, res, next);
}

export { GZIP_LEVEL, BROTLI_QUALITY, THRESHOLD };
