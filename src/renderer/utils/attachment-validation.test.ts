/**
 * Tests for attachment validation utility
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import { validateFile, getMaxFileSize, getSupportedTypesDescription } from './attachment-validation';

describe('validateFile', () => {
  describe('size validation', () => {
    it('should reject empty files', () => {
      const result = validateFile({
        name: 'empty.jpg',
        size: 0,
        type: 'image/jpeg',
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('empty');
    });

    it('should accept files exactly at 25MB limit', () => {
      const result = validateFile({
        name: 'large.jpg',
        size: 25 * 1024 * 1024,
        type: 'image/jpeg',
      });
      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should reject files over 25MB limit', () => {
      const result = validateFile({
        name: 'toolarge.jpg',
        size: 25 * 1024 * 1024 + 1,
        type: 'image/jpeg',
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('25 MB');
    });

    it('should accept small files', () => {
      const result = validateFile({
        name: 'small.jpg',
        size: 1024,
        type: 'image/jpeg',
      });
      expect(result.valid).toBe(true);
    });

    it('should format file size in error message', () => {
      const result = validateFile({
        name: 'toolarge.jpg',
        size: 30 * 1024 * 1024,
        type: 'image/jpeg',
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/30\.\d MB/);
    });
  });

  describe('MIME type validation', () => {
    it('should accept JPEG images', () => {
      const result = validateFile({
        name: 'photo.jpg',
        size: 1024,
        type: 'image/jpeg',
      });
      expect(result.valid).toBe(true);
    });

    it('should accept PNG images', () => {
      const result = validateFile({
        name: 'photo.png',
        size: 1024,
        type: 'image/png',
      });
      expect(result.valid).toBe(true);
    });

    it('should accept GIF images', () => {
      const result = validateFile({
        name: 'animation.gif',
        size: 1024,
        type: 'image/gif',
      });
      expect(result.valid).toBe(true);
    });

    it('should accept WebP images', () => {
      const result = validateFile({
        name: 'photo.webp',
        size: 1024,
        type: 'image/webp',
      });
      expect(result.valid).toBe(true);
    });

    it('should accept MP4 videos', () => {
      const result = validateFile({
        name: 'video.mp4',
        size: 1024,
        type: 'video/mp4',
      });
      expect(result.valid).toBe(true);
    });

    it('should accept WebM videos', () => {
      const result = validateFile({
        name: 'video.webm',
        size: 1024,
        type: 'video/webm',
      });
      expect(result.valid).toBe(true);
    });

    it('should accept MP3 audio', () => {
      const result = validateFile({
        name: 'audio.mp3',
        size: 1024,
        type: 'audio/mpeg',
      });
      expect(result.valid).toBe(true);
    });

    it('should accept OGG audio', () => {
      const result = validateFile({
        name: 'audio.ogg',
        size: 1024,
        type: 'audio/ogg',
      });
      expect(result.valid).toBe(true);
    });

    it('should accept WAV audio', () => {
      const result = validateFile({
        name: 'audio.wav',
        size: 1024,
        type: 'audio/wav',
      });
      expect(result.valid).toBe(true);
    });

    it('should accept PDF documents', () => {
      const result = validateFile({
        name: 'document.pdf',
        size: 1024,
        type: 'application/pdf',
      });
      expect(result.valid).toBe(true);
    });

    it('should reject unsupported MIME types', () => {
      const result = validateFile({
        name: 'document.doc',
        size: 1024,
        type: 'application/msword',
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not supported');
    });

    it('should reject files with empty MIME type', () => {
      const result = validateFile({
        name: 'unknown',
        size: 1024,
        type: '',
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not supported');
    });

    it('should include supported types in error message', () => {
      const result = validateFile({
        name: 'document.doc',
        size: 1024,
        type: 'application/msword',
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('JPEG');
      expect(result.reason).toContain('PNG');
      expect(result.reason).toContain('MP4');
      expect(result.reason).toContain('PDF');
    });
  });

  describe('property-based tests', () => {
    it('should reject all files over size limit regardless of MIME type', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 25 * 1024 * 1024 + 1, max: 100 * 1024 * 1024 }),
          fc.constantFrom(
            'image/jpeg',
            'image/png',
            'video/mp4',
            'audio/mpeg',
            'application/pdf'
          ),
          (size, mimeType) => {
            const result = validateFile({
              name: 'test',
              size,
              type: mimeType,
            });
            return result.valid === false && result.reason !== undefined;
          }
        )
      );
    });

    it('should accept all files under size limit with valid MIME types', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 25 * 1024 * 1024 }),
          fc.constantFrom(
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'video/mp4',
            'video/webm',
            'audio/mpeg',
            'audio/ogg',
            'audio/wav',
            'application/pdf'
          ),
          (size, mimeType) => {
            const result = validateFile({
              name: 'test',
              size,
              type: mimeType,
            });
            return result.valid === true;
          }
        )
      );
    });

    it('should reject all unsupported MIME types regardless of size', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 25 * 1024 * 1024 }),
          fc.constantFrom(
            'application/msword',
            'application/zip',
            'text/html',
            'video/avi',
            'image/bmp'
          ),
          (size, mimeType) => {
            const result = validateFile({
              name: 'test',
              size,
              type: mimeType,
            });
            return result.valid === false && result.reason !== undefined;
          }
        )
      );
    });
  });

  describe('integration: complete validation pipeline', () => {
    it('should correctly validate a batch of mixed files through the full pipeline', () => {
      const files: Array<{ name: string; size: number; type: string }> = [
        { name: 'photo.jpg', size: 2 * 1024 * 1024, type: 'image/jpeg' },
        { name: 'huge.png', size: 30 * 1024 * 1024, type: 'image/png' },
        { name: 'doc.docx', size: 1024, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        { name: 'empty.gif', size: 0, type: 'image/gif' },
        { name: 'song.mp3', size: 5 * 1024 * 1024, type: 'audio/mpeg' },
        { name: 'clip.mp4', size: 25 * 1024 * 1024, type: 'video/mp4' },
        { name: 'readme.txt', size: 512, type: 'text/plain' },
        { name: 'report.pdf', size: 100 * 1024, type: 'application/pdf' },
      ];

      const results = files.map((f) => ({ file: f.name, ...validateFile(f) }));

      // Valid files
      expect(results[0]).toEqual({ file: 'photo.jpg', valid: true });
      expect(results[4]).toEqual({ file: 'song.mp3', valid: true });
      expect(results[5]).toEqual({ file: 'clip.mp4', valid: true });
      expect(results[7]).toEqual({ file: 'report.pdf', valid: true });

      // Invalid: too large
      expect(results[1].valid).toBe(false);
      expect(results[1].reason).toContain('25 MB');

      // Invalid: unsupported MIME
      expect(results[2].valid).toBe(false);
      expect(results[2].reason).toContain('not supported');

      // Invalid: empty
      expect(results[3].valid).toBe(false);
      expect(results[3].reason).toContain('empty');

      // Invalid: unsupported MIME (text)
      expect(results[6].valid).toBe(false);
      expect(results[6].reason).toContain('not supported');

      // Summary: 4 valid, 4 invalid
      const valid = results.filter((r) => r.valid);
      const invalid = results.filter((r) => !r.valid);
      expect(valid).toHaveLength(4);
      expect(invalid).toHaveLength(4);
    });
  });

  describe('utility functions', () => {
    it('should return correct max file size', () => {
      expect(getMaxFileSize()).toBe(25 * 1024 * 1024);
    });

    it('should return supported types description', () => {
      const description = getSupportedTypesDescription();
      expect(description).toContain('JPEG');
      expect(description).toContain('PNG');
      expect(description).toContain('MP4');
      expect(description).toContain('PDF');
    });
  });
});
