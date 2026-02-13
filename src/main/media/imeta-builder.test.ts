/**
 * Tests for NIP-94 imeta tag builder
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import { buildImetaTag, buildImetaTags, buildMediaJson } from './imeta-builder';
import { AttachmentData } from '../../shared/types';

const imageAttachment: AttachmentData = {
  hash: 'abc123def456',
  name: 'photo.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 2048576,
  dimensions: { width: 1920, height: 1080 },
  blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
};

const pdfAttachment: AttachmentData = {
  hash: 'deadbeef0000',
  name: 'document.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 102400,
};

const audioAttachment: AttachmentData = {
  hash: 'feed1234cafe',
  name: 'song.mp3',
  mimeType: 'audio/mpeg',
  sizeBytes: 5242880,
};

describe('buildImetaTag', () => {
  it('should produce tag starting with "imeta"', () => {
    const tag = buildImetaTag(imageAttachment);
    expect(tag[0]).toBe('imeta');
  });

  it('should include local-blob placeholder URL', () => {
    const tag = buildImetaTag(imageAttachment);
    expect(tag).toContain(`url local-blob:${imageAttachment.hash}`);
  });

  it('should include MIME type', () => {
    const tag = buildImetaTag(imageAttachment);
    expect(tag).toContain('m image/jpeg');
  });

  it('should include size in bytes', () => {
    const tag = buildImetaTag(imageAttachment);
    expect(tag).toContain('size 2048576');
  });

  it('should include dimensions for images', () => {
    const tag = buildImetaTag(imageAttachment);
    expect(tag).toContain('dim 1920x1080');
  });

  it('should include blurhash for images', () => {
    const tag = buildImetaTag(imageAttachment);
    expect(tag).toContain('blurhash LEHV6nWB2yk8pyo0adR*.7kCMdnj');
  });

  it('should include sha256 hash', () => {
    const tag = buildImetaTag(imageAttachment);
    expect(tag).toContain('sha256 abc123def456');
  });

  it('should omit dim for non-image attachments', () => {
    const tag = buildImetaTag(pdfAttachment);
    const dimEntry = tag.find((entry) => entry.startsWith('dim '));
    expect(dimEntry).toBeUndefined();
  });

  it('should omit blurhash for non-image attachments', () => {
    const tag = buildImetaTag(pdfAttachment);
    const blurhashEntry = tag.find((entry) => entry.startsWith('blurhash '));
    expect(blurhashEntry).toBeUndefined();
  });

  it('should have correct number of entries for image attachment', () => {
    const tag = buildImetaTag(imageAttachment);
    // imeta, url, m, size, dim, blurhash, sha256 = 7
    expect(tag).toHaveLength(7);
  });

  it('should have correct number of entries for non-image attachment', () => {
    const tag = buildImetaTag(pdfAttachment);
    // imeta, url, m, size, sha256 = 5
    expect(tag).toHaveLength(5);
  });
});

describe('buildImetaTags', () => {
  it('should build tags for multiple attachments in order', () => {
    const tags = buildImetaTags([imageAttachment, pdfAttachment, audioAttachment]);
    expect(tags).toHaveLength(3);
    expect(tags[0]).toContain(`url local-blob:${imageAttachment.hash}`);
    expect(tags[1]).toContain(`url local-blob:${pdfAttachment.hash}`);
    expect(tags[2]).toContain(`url local-blob:${audioAttachment.hash}`);
  });

  it('should return empty array for no attachments', () => {
    const tags = buildImetaTags([]);
    expect(tags).toEqual([]);
  });

  it('should preserve attachment order (AC-014)', () => {
    const attachments = [audioAttachment, imageAttachment, pdfAttachment];
    const tags = buildImetaTags(attachments);

    // Extract hashes from tags in order
    const tagHashes = tags.map((tag) => {
      const sha256Entry = tag.find((entry) => entry.startsWith('sha256 '));
      return sha256Entry?.replace('sha256 ', '');
    });

    expect(tagHashes).toEqual([audioAttachment.hash, imageAttachment.hash, pdfAttachment.hash]);
  });
});

describe('buildMediaJson', () => {
  it('should produce valid JSON', () => {
    const json = buildMediaJson([imageAttachment]);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('should have attachments array', () => {
    const parsed = JSON.parse(buildMediaJson([imageAttachment]));
    expect(parsed.attachments).toBeInstanceOf(Array);
    expect(parsed.attachments).toHaveLength(1);
  });

  it('should include attachment metadata', () => {
    const parsed = JSON.parse(buildMediaJson([imageAttachment]));
    const attachment = parsed.attachments[0];
    expect(attachment.hash).toBe(imageAttachment.hash);
    expect(attachment.name).toBe(imageAttachment.name);
    expect(attachment.mimeType).toBe(imageAttachment.mimeType);
    expect(attachment.sizeBytes).toBe(imageAttachment.sizeBytes);
    expect(attachment.dimensions).toEqual(imageAttachment.dimensions);
    expect(attachment.blurhash).toBe(imageAttachment.blurhash);
  });

  it('should include imeta tags inline', () => {
    const parsed = JSON.parse(buildMediaJson([imageAttachment]));
    const attachment = parsed.attachments[0];
    expect(attachment.imeta[0]).toBe('imeta');
    expect(attachment.imeta).toContain(`url local-blob:${imageAttachment.hash}`);
  });

  it('should handle multiple attachments in order', () => {
    const parsed = JSON.parse(buildMediaJson([imageAttachment, pdfAttachment]));
    expect(parsed.attachments).toHaveLength(2);
    expect(parsed.attachments[0].hash).toBe(imageAttachment.hash);
    expect(parsed.attachments[1].hash).toBe(pdfAttachment.hash);
  });

  it('should produce empty attachments for no attachments', () => {
    const parsed = JSON.parse(buildMediaJson([]));
    expect(parsed.attachments).toEqual([]);
  });
});

describe('property-based tests', () => {
  const hexStringArb = fc
    .array(fc.integer({ min: 0, max: 15 }), { minLength: 64, maxLength: 64 })
    .map((arr) => arr.map((n) => n.toString(16)).join(''));

  const attachmentArb: fc.Arbitrary<AttachmentData> = fc.record({
    hash: hexStringArb,
    name: fc.string({ minLength: 1, maxLength: 50 }),
    mimeType: fc.constantFrom('image/jpeg', 'image/png', 'video/mp4', 'audio/mpeg', 'application/pdf'),
    sizeBytes: fc.integer({ min: 1, max: 25 * 1024 * 1024 }),
    dimensions: fc.option(
      fc.record({
        width: fc.integer({ min: 1, max: 8000 }),
        height: fc.integer({ min: 1, max: 8000 }),
      }),
      { nil: undefined }
    ),
    blurhash: fc.option(fc.string({ minLength: 4, maxLength: 40 }), { nil: undefined }),
  });

  it('should always produce tag starting with imeta', () => {
    fc.assert(
      fc.property(attachmentArb, (attachment) => {
        const tag = buildImetaTag(attachment);
        return tag[0] === 'imeta';
      })
    );
  });

  it('should always contain local-blob placeholder', () => {
    fc.assert(
      fc.property(attachmentArb, (attachment) => {
        const tag = buildImetaTag(attachment);
        return tag.includes(`url local-blob:${attachment.hash}`);
      })
    );
  });

  it('should always produce valid JSON from buildMediaJson', () => {
    fc.assert(
      fc.property(fc.array(attachmentArb, { minLength: 0, maxLength: 5 }), (attachments) => {
        const json = buildMediaJson(attachments);
        const parsed = JSON.parse(json);
        return (
          parsed.attachments.length === attachments.length &&
          parsed.attachments.every(
            (a: { imeta: string[] }) => a.imeta[0] === 'imeta'
          )
        );
      })
    );
  });

  it('should preserve attachment order across any permutation', () => {
    fc.assert(
      fc.property(fc.array(attachmentArb, { minLength: 1, maxLength: 5 }), (attachments) => {
        const tags = buildImetaTags(attachments);
        for (let i = 0; i < attachments.length; i++) {
          const sha256Entry = tags[i].find((entry) => entry.startsWith('sha256 '));
          if (sha256Entry !== `sha256 ${attachments[i].hash}`) return false;
        }
        return true;
      })
    );
  });
});
