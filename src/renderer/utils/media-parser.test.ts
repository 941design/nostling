import { describe, it, expect } from '@jest/globals';
import {
  parseMediaJson,
  parseImetaTags,
  parseNip92UrlTags,
  parseIncomingMedia,
  isImageMimeType,
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

  it('parses incoming format with tags array (NIP-92 url)', () => {
    const mediaJson = JSON.stringify({
      tags: [
        ['url', 'https://example.com/legacy-image.jpg'],
      ],
    });

    const result = parseMediaJson(mediaJson);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://example.com/legacy-image.jpg');
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

  it('parses url tags', () => {
    const tags = [
      ['url', 'https://example.com/image.jpg'],
      ['url', 'https://example.com/doc.pdf'],
    ];

    const result = parseNip92UrlTags(tags);
    expect(result).toHaveLength(2);
    expect(result[0].url).toBe('https://example.com/image.jpg');
    expect(result[1].url).toBe('https://example.com/doc.pdf');
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
