// CommonJS mock for `sharp` to ensure compatibility with different module resolutions.
const { Buffer } = require('buffer');

function createApi(initialBuffer, info = {}) {
  let buffer = initialBuffer;
  const state = {
    resizeDims: null,
    format: info.format || 'jpeg',
    ops: [],
  };

  const api = {
    resize(width, height, opts) {
      state.resizeDims = { width, height, opts };
      state.ops.push({ op: 'resize', width, height });
      return api;
    },
    webp(opts) {
      state.format = 'webp';
      state.ops.push({ op: 'webp', opts });
      return api;
    },
    jpeg(opts) {
      state.format = 'jpeg';
      state.ops.push({ op: 'jpeg', opts });
      return api;
    },
    png(opts) {
      state.format = 'png';
      state.ops.push({ op: 'png', opts });
      return api;
    },
    toFormat(fmt) {
      state.format = fmt;
      state.ops.push({ op: 'toFormat', fmt });
      return api;
    },
    async toBuffer() {
      // Simulate failure for deliberately invalid test input
      try {
        if (Buffer.isBuffer(buffer) && buffer.toString() === 'invalid') {
          throw new Error('Input buffer is invalid');
        }
      } catch (e) {
        throw e;
      }

      // Simulate compression: if webp conversion requested, make buffer smaller
      let outSize = buffer.length || 0;
      const hasWebp = state.ops.some((o) => o.op === 'webp' || (o.op === 'toFormat' && o.fmt === 'webp'));
      if (hasWebp) {
        outSize = Math.max(1, Math.floor(outSize * 0.5));
      }

      // If resize dims present and smaller area, simulate reduced size
      let outWidth = null;
      let outHeight = null;
      if (state.resizeDims && state.resizeDims.width && state.resizeDims.height) {
        const area = state.resizeDims.width * state.resizeDims.height;
        outSize = Math.min(outSize || Infinity, Math.max(1, Math.floor(area * 3)));
        outWidth = state.resizeDims.width;
        outHeight = state.resizeDims.height;
      }

      // Default small buffer if initial was empty
      if (!outSize) outSize = 1;
      const out = Buffer.alloc(outSize, 0);
      // Attach metadata so later sharp(result).metadata() can read dimensions
      out.__meta = { width: outWidth, height: outHeight, format: state.format };
      return out;
    },
    async metadata() {
      // If buffer was produced by resize, infer dims; otherwise return provided info
      if (state.resizeDims && state.resizeDims.width && state.resizeDims.height) {
        return {
          width: state.resizeDims.width,
          height: state.resizeDims.height,
          format: state.format,
        };
      }
      return {
        width: info.width || null,
        height: info.height || null,
        format: state.format || info.format || 'jpeg',
      };
    },
  };
  return api;
}

function sharp(input) {
  // Handle the factory-style call: sharp({ create: { width, height, channels } })
  if (input && typeof input === 'object' && input.create) {
    const { width = 1, height = 1, channels = 3 } = input.create;
    const size = Math.max(0, width * height * channels);
    const buf = Buffer.alloc(size, 255);
    return createApi(buf, { width, height, format: 'jpeg' });
  }

  // Called with a Buffer — return chainable API that operates on that buffer
  if (Buffer.isBuffer(input)) {
    const info = input.__meta || {};
    return createApi(input, info);
  }

  // Default empty image
  return createApi(Buffer.alloc(0), {});
}

module.exports = sharp;
module.exports.default = sharp;
