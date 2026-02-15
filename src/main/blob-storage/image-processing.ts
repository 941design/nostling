/**
 * Pure-JS image processing for JPEG and PNG.
 *
 * Replaces the native `sharp` dependency to eliminate platform-specific
 * N-API / libvips issues in packaged Electron apps.
 */

import { promises as fs } from 'fs';
import { encode as encodeBlurhash } from 'blurhash';

// These packages lack TS declarations — use require with inline types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const jpeg: {
  decode: (buf: Buffer, opts?: { formatAsRGBA?: boolean; useTArray?: boolean }) => {
    width: number;
    height: number;
    data: Buffer;
  };
} = require('jpeg-js');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PNG } = require('pngjs') as {
  PNG: {
    sync: {
      read: (buf: Buffer) => { width: number; height: number; data: Buffer };
      write: (png: { width: number; height: number; data: Buffer }) => Buffer;
    };
  };
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const piexif: {
  load: (binaryString: string) => Record<string, Record<string, unknown>>;
  remove: (binaryString: string) => string;
  insert: (exifStr: string, binaryString: string) => string;
  dump: (exifObj: Record<string, Record<string, unknown>>) => string;
  ImageIFD: Record<string, number>;
  ExifIFD: Record<string, number>;
  GPSIFD: Record<string, number>;
} = require('piexifjs');

/** Raw RGBA pixel buffer with dimensions. */
interface RGBAPixels {
  width: number;
  height: number;
  data: Buffer;
}

export interface ProcessedImage {
  dimensions: { width: number; height: number };
  blurhash: string;
  processedBuffer: Buffer;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Convert a Buffer to a binary string (Latin-1 encoding). */
function bufferToBinaryString(buf: Buffer): string {
  // latin1 is the correct encoding for piexifjs which works on binary strings
  return buf.toString('latin1');
}

/** Convert a binary string back to a Buffer. */
function binaryStringToBuffer(str: string): Buffer {
  return Buffer.from(str, 'latin1');
}

/**
 * Strip EXIF from a JPEG buffer using byte-level surgery (no pixel re-encode).
 * For non-JPEG buffers, returns the buffer unchanged.
 */
function stripExif(buffer: Buffer, mimeType: string): Buffer {
  if (mimeType !== 'image/jpeg') return buffer;
  try {
    const binaryStr = bufferToBinaryString(buffer);
    const stripped = piexif.remove(binaryStr);
    return binaryStringToBuffer(stripped);
  } catch {
    // If piexif can't parse it (no EXIF present, etc.), return as-is
    return buffer;
  }
}

/**
 * Read EXIF orientation tag (1-8) from a JPEG buffer.
 * Returns 1 (normal) for non-JPEG or if no orientation tag is present.
 */
function readExifOrientation(buffer: Buffer, mimeType: string): number {
  if (mimeType !== 'image/jpeg') return 1;
  try {
    const binaryStr = bufferToBinaryString(buffer);
    const exifData = piexif.load(binaryStr);
    // Orientation is in the "0th" IFD, tag 0x0112 (274)
    const orientation = exifData['0th']?.[274];
    if (typeof orientation === 'number' && orientation >= 1 && orientation <= 8) {
      return orientation;
    }
    return 1;
  } catch {
    return 1;
  }
}

/** Decode a JPEG or PNG buffer to raw RGBA pixels. */
function decodeToRGBA(buffer: Buffer, mimeType: string): RGBAPixels {
  if (mimeType === 'image/jpeg') {
    const decoded = jpeg.decode(buffer, { formatAsRGBA: true, useTArray: true });
    return {
      width: decoded.width,
      height: decoded.height,
      data: Buffer.from(decoded.data),
    };
  }
  if (mimeType === 'image/png') {
    const decoded = PNG.sync.read(buffer);
    return {
      width: decoded.width,
      height: decoded.height,
      data: decoded.data,
    };
  }
  throw new Error(`Unsupported image type for decoding: ${mimeType}`);
}

/**
 * Apply EXIF orientation transform to raw RGBA pixels.
 *
 * Orientation values (EXIF spec):
 *   1 = normal
 *   2 = flip horizontal
 *   3 = rotate 180
 *   4 = flip vertical
 *   5 = transpose (flip horizontal + rotate 270 CW)
 *   6 = rotate 90 CW
 *   7 = transverse (flip horizontal + rotate 90 CW)
 *   8 = rotate 270 CW (= 90 CCW)
 */
function applyOrientation(pixels: RGBAPixels, orientation: number): RGBAPixels {
  if (orientation === 1) return pixels;

  const { width: srcW, height: srcH, data: src } = pixels;
  const swapDims = orientation >= 5; // orientations 5-8 swap width/height
  const dstW = swapDims ? srcH : srcW;
  const dstH = swapDims ? srcW : srcH;
  const dst = Buffer.alloc(dstW * dstH * 4);

  for (let srcY = 0; srcY < srcH; srcY++) {
    for (let srcX = 0; srcX < srcW; srcX++) {
      let dstX: number, dstY: number;

      switch (orientation) {
        case 2: dstX = srcW - 1 - srcX; dstY = srcY; break;
        case 3: dstX = srcW - 1 - srcX; dstY = srcH - 1 - srcY; break;
        case 4: dstX = srcX; dstY = srcH - 1 - srcY; break;
        case 5: dstX = srcY; dstY = srcX; break;
        case 6: dstX = srcH - 1 - srcY; dstY = srcX; break;
        case 7: dstX = srcH - 1 - srcY; dstY = srcW - 1 - srcX; break;
        case 8: dstX = srcY; dstY = srcW - 1 - srcX; break;
        default: dstX = srcX; dstY = srcY; break;
      }

      const srcOff = (srcY * srcW + srcX) * 4;
      const dstOff = (dstY * dstW + dstX) * 4;
      dst[dstOff] = src[srcOff];
      dst[dstOff + 1] = src[srcOff + 1];
      dst[dstOff + 2] = src[srcOff + 2];
      dst[dstOff + 3] = src[srcOff + 3];
    }
  }

  return { width: dstW, height: dstH, data: dst };
}

/**
 * Nearest-neighbor downscale to fit inside `maxDim x maxDim`.
 * Returns original pixels if already small enough.
 */
function resizeNearestNeighbor(pixels: RGBAPixels, maxDim: number): RGBAPixels {
  const { width: srcW, height: srcH, data: src } = pixels;

  if (srcW <= maxDim && srcH <= maxDim) return pixels;

  const scale = Math.min(maxDim / srcW, maxDim / srcH);
  const dstW = Math.max(1, Math.round(srcW * scale));
  const dstH = Math.max(1, Math.round(srcH * scale));
  const dst = Buffer.alloc(dstW * dstH * 4);

  for (let y = 0; y < dstH; y++) {
    const srcY = Math.min(Math.floor(y / scale), srcH - 1);
    for (let x = 0; x < dstW; x++) {
      const srcX = Math.min(Math.floor(x / scale), srcW - 1);
      const srcOff = (srcY * srcW + srcX) * 4;
      const dstOff = (y * dstW + x) * 4;
      dst[dstOff] = src[srcOff];
      dst[dstOff + 1] = src[srcOff + 1];
      dst[dstOff + 2] = src[srcOff + 2];
      dst[dstOff + 3] = src[srcOff + 3];
    }
  }

  return { width: dstW, height: dstH, data: dst };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Process an image file: strip EXIF, compute display dimensions and blurhash.
 *
 * The returned `processedBuffer` has EXIF stripped (byte-level for JPEG)
 * and is ready for content-addressed storage.
 *
 * Display dimensions account for EXIF orientation (e.g. a 3000x4000 portrait
 * JPEG with orientation=6 reports dimensions 4000x3000... wait, that's wrong).
 * Actually: a portrait photo taken in landscape sensor orientation has
 * orientation=6 which means "rotate 90 CW to display correctly", so the
 * stored pixels are e.g. 4000w x 3000h but display dimensions are 3000w x 4000h.
 */
export async function processImage(
  filePath: string,
  mimeType: string,
): Promise<ProcessedImage> {
  const buffer = await fs.readFile(filePath);

  // 1. Read EXIF orientation before stripping
  const orientation = readExifOrientation(buffer, mimeType);

  // 2. Strip EXIF (byte-level for JPEG, no-op for PNG)
  const processedBuffer = stripExif(buffer, mimeType);

  // 3. Decode to raw RGBA for dimension calculation and blurhash
  const rawPixels = decodeToRGBA(buffer, mimeType);

  // 4. Compute display dimensions by applying orientation
  const oriented = applyOrientation(rawPixels, orientation);
  const dimensions = { width: oriented.width, height: oriented.height };

  // 5. Resize the oriented pixels to a small thumbnail for blurhash
  const thumbnail = resizeNearestNeighbor(oriented, 32);

  // 6. Encode blurhash
  const blurhash = encodeBlurhash(
    new Uint8ClampedArray(thumbnail.data.buffer, thumbnail.data.byteOffset, thumbnail.data.length),
    thumbnail.width,
    thumbnail.height,
    4,
    3,
  );

  return { dimensions, blurhash, processedBuffer };
}
