import { describe, it, expect } from '@jest/globals';
import {
  parseMediaJson,
  parseImetaTags,
  parseNip92UrlTags,
  parseIncomingMedia,
  isImageMimeType,
  isRenderableImageMimeType,
  isBlobUrl,
  inferMimeFromUrl,
  formatFileSize,
  ParsedMediaAttachment,
} from './media-parser';

describe('parseMediaJson', () => {
  it('returns empty array for undefined input', () => {
    expect(parseMediaJson(undefined)).toEqual([]);
  });

  it('returns empty array for invalid JSON', () => {
    expect(parseMediaJson('not json')).toEqual([]);
  });

  it('returns empty array for JSON without attachments', () => {
    expect(parseMediaJson('{}')).toEqual([]);
    expect(parseMediaJson('{"attachments": null}')).toEqual([]);
  });

  it('parses attachments with resolved URLs from imeta tags', () => {
    const mediaJson = JSON.stringify({
      attachments: [{
        hash: 'abc123',
        name: 'photo.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 12345,
        dimensions: { width: 800, height: 600 },
        blurhash: 'LEHV6nWB',
        imeta: ['imeta', 'url https://blossom.example/abc123', 'm image/jpeg', 'size 12345', 'dim 800x600', 'blurhash LEHV6nWB', 'sha256 abc123'],
      }],
    });

    const result = parseMediaJson(mediaJson);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      url: 'https://blossom.example/abc123',
      mimeType: 'image/jpeg',
      sizeBytes: 12345,
      dimensions: { width: 800, height: 600 },
      blurhash: 'LEHV6nWB',
      sha256: 'abc123',
      fileName: 'photo.jpg',
      isLocalBlob: false,
    });
  });

  it('detects unresolved local-blob placeholders', () => {
    const mediaJson = JSON.stringify({
      attachments: [{
        hash: 'abc123',
        name: 'photo.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 5000,
        imeta: ['imeta', 'url local-blob:abc123', 'm image/jpeg', 'size 5000', 'sha256 abc123'],
      }],
    });

    const result = parseMediaJson(mediaJson);
    expect(result).toHaveLength(1);
    expect(result[0].isLocalBlob).toBe(true);
    expect(result[0].url).toBe('local-blob:abc123');
  });

  it('falls back to local-blob URL when imeta has no url entry', () => {
    const mediaJson = JSON.stringify({
      attachments: [{ hash: 'def456', name: 'doc.pdf', mimeType: 'application/pdf', sizeBytes: 9999 }],
    });

    const result = parseMediaJson(mediaJson);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('local-blob:def456');
    expect(result[0].isLocalBlob).toBe(true);
  });

  it('handles multiple attachments', () => {
    const mediaJson = JSON.stringify({
      attachments: [
        { hash: 'aaa', name: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 100, imeta: ['imeta', 'url https://example.com/a'] },
        { hash: 'bbb', name: 'b.pdf', mimeType: 'application/pdf', sizeBytes: 200, imeta: ['imeta', 'url https://example.com/b'] },
      ],
    });

    const result = parseMediaJson(mediaJson);
    expect(result).toHaveLength(2);
    expect(result[0].fileName).toBe('a.jpg');
    expect(result[1].fileName).toBe('b.pdf');
  });

  it('parses incoming format with tags array (imeta)', () => {
    const mediaJson = JSON.stringify({
      tags: [
        ['imeta', 'url https://blossom.example/hash1', 'm image/jpeg', 'size 5000', 'dim 800x600', 'blurhash LEHV6n', 'sha256 hash1'],
      ],
    });

    const result = parseMediaJson(mediaJson);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://blossom.example/hash1');
    expect(result[0].mimeType).toBe('image/jpeg');
    expect(result[0].isLocalBlob).toBe(false);
  });

  it('parses incoming format with tags array (NIP-92 url) with MIME inference', () => {
    const mediaJson = JSON.stringify({
      tags: [
        ['url', 'https://example.com/legacy-image.jpg'],
      ],
    });

    const result = parseMediaJson(mediaJson);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://example.com/legacy-image.jpg');
    expect(result[0].mimeType).toBe('image/jpeg');
  });
});

describe('parseImetaTags', () => {
  it('returns empty array for empty tags', () => {
    expect(parseImetaTags([])).toEqual([]);
  });

  it('parses imeta tags with all fields', () => {
    const tags = [
      ['imeta', 'url https://blossom.example/hash1', 'm image/jpeg', 'size 12345', 'dim 800x600', 'blurhash LEHV6nWB', 'sha256 hash1'],
    ];

    const result = parseImetaTags(tags);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      url: 'https://blossom.example/hash1',
      mimeType: 'image/jpeg',
      sizeBytes: 12345,
      dimensions: { width: 800, height: 600 },
      blurhash: 'LEHV6nWB',
      sha256: 'hash1',
      isLocalBlob: false,
    });
  });

  it('ignores non-imeta tags', () => {
    const tags = [
      ['p', 'somepubkey'],
      ['imeta', 'url https://example.com/img', 'm image/png'],
      ['e', 'someeventid'],
    ];

    const result = parseImetaTags(tags);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://example.com/img');
  });

  it('handles imeta tag with minimal fields', () => {
    const tags = [['imeta', 'url https://example.com/file']];
    const result = parseImetaTags(tags);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://example.com/file');
    expect(result[0].mimeType).toBeUndefined();
    expect(result[0].sizeBytes).toBeUndefined();
  });

  it('filters out entries without url', () => {
    const tags = [['imeta', 'm image/jpeg', 'size 100']];
    const result = parseImetaTags(tags);
    expect(result).toHaveLength(0);
  });
});

describe('parseNip92UrlTags', () => {
  it('returns empty array for empty tags', () => {
    expect(parseNip92UrlTags([])).toEqual([]);
  });

  it('parses url tags with MIME inference', () => {
    const tags = [
      ['url', 'https://example.com/image.jpg'],
      ['url', 'https://example.com/doc.pdf'],
    ];

    const result = parseNip92UrlTags(tags);
    expect(result).toHaveLength(2);
    expect(result[0].url).toBe('https://example.com/image.jpg');
    expect(result[0].mimeType).toBe('image/jpeg');
    expect(result[1].url).toBe('https://example.com/doc.pdf');
    expect(result[1].mimeType).toBe('application/pdf');
    expect(result[0].isLocalBlob).toBe(false);
  });

  it('ignores malformed url tags', () => {
    const tags = [['url']]; // Missing URL value
    expect(parseNip92UrlTags(tags)).toEqual([]);
  });
});

describe('parseIncomingMedia', () => {
  it('prefers NIP-94 imeta over NIP-92 url', () => {
    const tags = [
      ['imeta', 'url https://example.com/via-imeta', 'm image/jpeg'],
      ['url', 'https://example.com/via-url'],
    ];

    const result = parseIncomingMedia(tags);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://example.com/via-imeta');
  });

  it('falls back to NIP-92 when no imeta tags', () => {
    const tags = [
      ['p', 'somepubkey'],
      ['url', 'https://example.com/legacy'],
    ];

    const result = parseIncomingMedia(tags);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://example.com/legacy');
  });

  it('returns empty for undefined tags', () => {
    expect(parseIncomingMedia(undefined)).toEqual([]);
  });
});

describe('inferMimeFromUrl', () => {
  it('infers MIME from common image extensions', () => {
    expect(inferMimeFromUrl('https://example.com/photo.jpg')).toBe('image/jpeg');
    expect(inferMimeFromUrl('https://example.com/photo.jpeg')).toBe('image/jpeg');
    expect(inferMimeFromUrl('https://example.com/photo.png')).toBe('image/png');
    expect(inferMimeFromUrl('https://example.com/photo.gif')).toBe('image/gif');
    expect(inferMimeFromUrl('https://example.com/photo.webp')).toBe('image/webp');
    expect(inferMimeFromUrl('https://example.com/photo.avif')).toBe('image/avif');
    expect(inferMimeFromUrl('https://example.com/photo.bmp')).toBe('image/bmp');
    expect(inferMimeFromUrl('https://example.com/photo.svg')).toBe('image/svg+xml');
  });

  it('infers MIME from TIFF and HEIC extensions', () => {
    expect(inferMimeFromUrl('https://example.com/photo.tiff')).toBe('image/tiff');
    expect(inferMimeFromUrl('https://example.com/photo.tif')).toBe('image/tiff');
    expect(inferMimeFromUrl('https://example.com/photo.heic')).toBe('image/heic');
    expect(inferMimeFromUrl('https://example.com/photo.heif')).toBe('image/heif');
  });

  it('infers MIME from non-image extensions', () => {
    expect(inferMimeFromUrl('https://example.com/video.mp4')).toBe('video/mp4');
    expect(inferMimeFromUrl('https://example.com/doc.pdf')).toBe('application/pdf');
  });

  it('is case-insensitive for extensions', () => {
    expect(inferMimeFromUrl('https://example.com/photo.JPG')).toBe('image/jpeg');
    expect(inferMimeFromUrl('https://example.com/photo.PNG')).toBe('image/png');
    expect(inferMimeFromUrl('https://example.com/photo.Webp')).toBe('image/webp');
  });

  it('returns undefined for extensionless URLs', () => {
    expect(inferMimeFromUrl('https://example.com/blob/abc123')).toBeUndefined();
    expect(inferMimeFromUrl('https://nostr.build/blob/abc123def456')).toBeUndefined();
  });

  it('returns undefined for unrecognized extensions', () => {
    expect(inferMimeFromUrl('https://example.com/file.xyz')).toBeUndefined();
    expect(inferMimeFromUrl('https://example.com/file.docx')).toBeUndefined();
  });

  it('returns undefined for invalid URLs', () => {
    expect(inferMimeFromUrl('not-a-url')).toBeUndefined();
    expect(inferMimeFromUrl('')).toBeUndefined();
  });

  it('handles URLs with query parameters', () => {
    expect(inferMimeFromUrl('https://example.com/photo.jpg?size=200')).toBe('image/jpeg');
    expect(inferMimeFromUrl('https://example.com/photo.png?v=2&format=raw')).toBe('image/png');
  });

  it('handles URLs with fragments', () => {
    expect(inferMimeFromUrl('https://example.com/photo.jpg#section')).toBe('image/jpeg');
  });

  it('uses the last extension in multi-dot filenames', () => {
    expect(inferMimeFromUrl('https://example.com/photo.backup.jpg')).toBe('image/jpeg');
    expect(inferMimeFromUrl('https://example.com/archive.tar.pdf')).toBe('application/pdf');
  });
});

describe('isBlobUrl', () => {
  it('returns true for blossom blob URLs', () => {
    expect(isBlobUrl('https://nostr.build/blob/abc123')).toBe(true);
    expect(isBlobUrl('https://blossom.example.com/blob/def456')).toBe(true);
    expect(isBlobUrl('https://cdn.example.com/api/blob/hash789')).toBe(true);
  });

  it('returns false for non-blob URLs', () => {
    expect(isBlobUrl('https://example.com/image.jpg')).toBe(false);
    expect(isBlobUrl('https://example.com/files/photo.png')).toBe(false);
  });

  it('returns false for non-HTTPS URLs', () => {
    expect(isBlobUrl('http://nostr.build/blob/abc123')).toBe(false);
  });

  it('returns false for invalid URLs', () => {
    expect(isBlobUrl('not-a-url')).toBe(false);
    expect(isBlobUrl('')).toBe(false);
  });
});

describe('parseImetaTags MIME inference', () => {
  it('infers MIME from URL extension when m field is missing', () => {
    const tags = [['imeta', 'url https://example.com/photo.jpg', 'size 12345']];
    const result = parseImetaTags(tags);
    expect(result).toHaveLength(1);
    expect(result[0].mimeType).toBe('image/jpeg');
    expect(result[0].sizeBytes).toBe(12345);
  });

  it('prefers explicit m field over URL extension', () => {
    const tags = [['imeta', 'url https://example.com/photo.jpg', 'm image/webp']];
    const result = parseImetaTags(tags);
    expect(result).toHaveLength(1);
    expect(result[0].mimeType).toBe('image/webp');
  });

  it('returns undefined mimeType for extensionless URL without m field', () => {
    const tags = [['imeta', 'url https://nostr.build/blob/abc123']];
    const result = parseImetaTags(tags);
    expect(result).toHaveLength(1);
    expect(result[0].mimeType).toBeUndefined();
  });

  it('handles multiple imeta tags with mixed MIME availability', () => {
    const tags = [
      ['imeta', 'url https://example.com/photo.jpg'],
      ['imeta', 'url https://example.com/doc.pdf', 'm application/pdf'],
      ['imeta', 'url https://nostr.build/blob/abc123'],
    ];
    const result = parseImetaTags(tags);
    expect(result).toHaveLength(3);
    expect(result[0].mimeType).toBe('image/jpeg');
    expect(result[1].mimeType).toBe('application/pdf');
    expect(result[2].mimeType).toBeUndefined();
  });
});

describe('isImageMimeType', () => {
  it('returns true for image types', () => {
    expect(isImageMimeType('image/jpeg')).toBe(true);
    expect(isImageMimeType('image/png')).toBe(true);
    expect(isImageMimeType('image/gif')).toBe(true);
    expect(isImageMimeType('image/webp')).toBe(true);
  });

  it('returns false for non-image types', () => {
    expect(isImageMimeType('application/pdf')).toBe(false);
    expect(isImageMimeType('video/mp4')).toBe(false);
    expect(isImageMimeType(undefined)).toBe(false);
  });
});

describe('isRenderableImageMimeType', () => {
  it('returns true for Chromium-native image formats', () => {
    expect(isRenderableImageMimeType('image/jpeg')).toBe(true);
    expect(isRenderableImageMimeType('image/png')).toBe(true);
    expect(isRenderableImageMimeType('image/gif')).toBe(true);
    expect(isRenderableImageMimeType('image/webp')).toBe(true);
    expect(isRenderableImageMimeType('image/avif')).toBe(true);
    expect(isRenderableImageMimeType('image/bmp')).toBe(true);
    expect(isRenderableImageMimeType('image/svg+xml')).toBe(true);
  });

  it('returns false for non-renderable image formats', () => {
    expect(isRenderableImageMimeType('image/heic')).toBe(false);
    expect(isRenderableImageMimeType('image/heif')).toBe(false);
    expect(isRenderableImageMimeType('image/tiff')).toBe(false);
  });

  it('returns false for non-image types', () => {
    expect(isRenderableImageMimeType('application/pdf')).toBe(false);
    expect(isRenderableImageMimeType('video/mp4')).toBe(false);
    expect(isRenderableImageMimeType(undefined)).toBe(false);
  });
});

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(2048)).toBe('2.0 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('returns empty for undefined', () => {
    expect(formatFileSize(undefined)).toBe('');
  });
});
