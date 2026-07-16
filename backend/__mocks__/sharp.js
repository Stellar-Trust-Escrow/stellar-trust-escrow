// Simple lightweight ESM mock for `sharp` used in tests to avoid native bindings.
// Supports chained calls used in the codebase: resize(...).webp(...).jpeg(...).toBuffer(), metadata().

import { Buffer } from 'buffer';

function createApi(buffer, info = {}) {
  const api = {
    resize() {
      return api;
    },
    webp() {
      return api;
    },
    jpeg() {
      return api;
    },
    png() {
      return api;
    },
    async toBuffer() {
      return buffer;
    },
    async metadata() {
      return {
        width: info.width || null,
        height: info.height || null,
        format: info.format || 'jpeg',
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
    const buf = Buffer.alloc(size);
    return createApi(buf, { width, height, format: 'jpeg' });
  }

  // Called with a Buffer — return chainable API that operates on that buffer
  if (Buffer.isBuffer(input)) {
    return createApi(input, {});
  }

  // Default empty image
  return createApi(Buffer.alloc(0), {});
}

export default sharp;
