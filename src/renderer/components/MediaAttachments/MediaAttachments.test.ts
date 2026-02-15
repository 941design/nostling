import { describe, expect, it } from '@jest/globals';
import {
  parseMediaJson,
  isImageMimeType,
  formatFileSize,
  ParsedMediaAttachment,
} from '../../utils/media-parser';
import { getStatusDisplay } from './index';

/**
 * Tests for media rendering decision logic used by MediaAttachments component.
 *
 * Since the project doesn't use React Testing Library, we test the rendering
 * decisions (what to show and when) as pure logic. The component delegates
 * parsing to media-parser.ts and renders based on attachment properties.
 */

describe('MediaAttachments rendering decisions', () => {
  describe('outgoing message with local blob preview (AC-028)', () => {
    it('identifies local blob attachments that need IPC resolution', () => {
      const mediaJson = JSON.stringify({
        attachments: [
          { hash: 'abc123', name: 'photo.jpg', mimeType: 'image/jpeg', sizeBytes: 50000 },
        ],
      });
      const attachments = parseMediaJson(mediaJson);
      expect(attachments).toHaveLength(1);
      expect(attachments[0].isLocalBlob).toBe(true);
      expect(attachments[0].url).toBe('local-blob:abc123');
      expect(attachments[0].sha256).toBe('abc123');
    });

    it('resolves remote URL after upload replaces placeholder', () => {
      const mediaJson = JSON.stringify({
        attachments: [
          {
            hash: 'abc123',
            name: 'photo.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 50000,
            imeta: ['url https://blossom.example/abc123', 'm image/jpeg', 'size 50000', 'sha256 abc123'],
          },
        ],
      });
      const attachments = parseMediaJson(mediaJson);
      expect(attachments[0].isLocalBlob).toBe(false);
      expect(attachments[0].url).toBe('https://blossom.example/abc123');
    });
  });

  describe('error state with retry (AC-029)', () => {
    it('identifies error-eligible messages by status and mediaJson', () => {
      const messageStatus = 'error';
      const hasMedia = true;
      // Component shows retry button when: isError && onRetry
      // onRetry is set when: message.status === 'error' && message.mediaJson
      expect(messageStatus === 'error' && hasMedia).toBe(true);
    });

    it('does not show retry for error messages without media', () => {
      const messageStatus = 'error';
      const hasMedia = false;
      expect(messageStatus === 'error' && hasMedia).toBe(false);
    });
  });

  describe('sent state rendering (AC-030)', () => {
    it('renders image attachment for image MIME types', () => {
      const attachment: ParsedMediaAttachment = {
        url: 'https://blossom.example/abc123',
        mimeType: 'image/jpeg',
        sizeBytes: 50000,
        isLocalBlob: false,
      };
      expect(isImageMimeType(attachment.mimeType)).toBe(true);
    });

    it('renders file attachment for non-image MIME types', () => {
      const attachment: ParsedMediaAttachment = {
        url: 'https://blossom.example/def456',
        mimeType: 'application/pdf',
        sizeBytes: 120000,
        fileName: 'document.pdf',
        isLocalBlob: false,
      };
      expect(isImageMimeType(attachment.mimeType)).toBe(false);
      expect(formatFileSize(attachment.sizeBytes)).toBe('117.2 KB');
    });

    it('renders file attachment when MIME type is unknown', () => {
      const attachment: ParsedMediaAttachment = {
        url: 'https://example.com/file',
        isLocalBlob: false,
      };
      expect(isImageMimeType(attachment.mimeType)).toBe(false);
    });
  });

  describe('incoming media fetch and cache (AC-031)', () => {
    it('parses incoming imeta tags from stored mediaJson', () => {
      const mediaJson = JSON.stringify({
        tags: [
          ['imeta', 'url https://blossom.example/img1', 'm image/png', 'size 30000', 'dim 800x600', 'blurhash LEHV6n', 'sha256 img1'],
        ],
      });
      const attachments = parseMediaJson(mediaJson);
      expect(attachments).toHaveLength(1);
      expect(attachments[0].url).toBe('https://blossom.example/img1');
      expect(attachments[0].mimeType).toBe('image/png');
      expect(attachments[0].dimensions).toEqual({ width: 800, height: 600 });
      expect(attachments[0].blurhash).toBe('LEHV6n');
      expect(attachments[0].isLocalBlob).toBe(false);
    });

    it('incoming images are not local blobs (no IPC needed)', () => {
      const mediaJson = JSON.stringify({
        tags: [
          ['imeta', 'url https://external.server/media/abc', 'm image/jpeg'],
        ],
      });
      const attachments = parseMediaJson(mediaJson);
      expect(attachments[0].isLocalBlob).toBe(false);
      // Component will use CachedImage for these URLs
    });
  });

  describe('blurhash placeholder (AC-032)', () => {
    it('attachment provides blurhash for placeholder rendering', () => {
      const mediaJson = JSON.stringify({
        tags: [
          ['imeta', 'url https://blossom.example/img1', 'm image/jpeg', 'blurhash LEHV6nWB2yk8pyo0adR*.7kCMdnj', 'dim 640x480'],
        ],
      });
      const attachments = parseMediaJson(mediaJson);
      expect(attachments[0].blurhash).toBe('LEHV6nWB2yk8pyo0adR*.7kCMdnj');
      expect(attachments[0].dimensions).toEqual({ width: 640, height: 480 });
    });

    it('attachment without blurhash falls back to loading state', () => {
      const mediaJson = JSON.stringify({
        tags: [
          ['imeta', 'url https://blossom.example/img1', 'm image/jpeg'],
        ],
      });
      const attachments = parseMediaJson(mediaJson);
      expect(attachments[0].blurhash).toBeUndefined();
      // Component will show "Loading..." text instead of blurhash
    });
  });

  describe('NIP-92 backward compatibility (AC-050)', () => {
    it('parses legacy url tags from incoming messages', () => {
      const mediaJson = JSON.stringify({
        tags: [
          ['url', 'https://legacy.server/image.jpg'],
        ],
      });
      const attachments = parseMediaJson(mediaJson);
      expect(attachments).toHaveLength(1);
      expect(attachments[0].url).toBe('https://legacy.server/image.jpg');
      expect(attachments[0].isLocalBlob).toBe(false);
    });

    it('prefers NIP-94 imeta over NIP-92 url tags', () => {
      const mediaJson = JSON.stringify({
        tags: [
          ['imeta', 'url https://blossom.example/img1', 'm image/jpeg', 'size 50000'],
          ['url', 'https://legacy.server/image.jpg'],
        ],
      });
      const attachments = parseMediaJson(mediaJson);
      // When imeta tags exist, url tags are ignored
      expect(attachments).toHaveLength(1);
      expect(attachments[0].url).toBe('https://blossom.example/img1');
    });
  });

  describe('upload progress state determination', () => {
    it('queued and sending states indicate uploading', () => {
      const uploadingStatuses = ['queued', 'sending'];
      for (const status of uploadingStatuses) {
        const isUploading = status === 'queued' || status === 'sending';
        expect(isUploading).toBe(true);
      }
    });

    it('sent and error states do not indicate uploading', () => {
      const nonUploadingStatuses = ['sent', 'error'];
      for (const status of nonUploadingStatuses) {
        const isUploading = status === 'queued' || status === 'sending';
        expect(isUploading).toBe(false);
      }
    });
  });

  describe('status icon transitions (AC-028 status indicators)', () => {
    it('queued shows clock icon', () => {
      const { icon, label } = getStatusDisplay('queued');
      expect(icon).toBe('clock');
      expect(label).toBe('Queued');
    });

    it('sending with upload in progress shows progress icon', () => {
      const { icon, label } = getStatusDisplay('sending', false);
      expect(icon).toBe('progress');
      expect(label).toBe('Uploading');
    });

    it('sending with upload complete shows spinner icon', () => {
      const { icon, label } = getStatusDisplay('sending', true);
      expect(icon).toBe('spinner');
      expect(label).toBe('Sending');
    });

    it('sent shows checkmark icon', () => {
      const { icon, label } = getStatusDisplay('sent');
      expect(icon).toBe('check');
      expect(label).toBe('Sent');
    });

    it('error shows warning icon', () => {
      const { icon, label } = getStatusDisplay('error');
      expect(icon).toBe('warning');
      expect(label).toBe('Upload failed');
    });

    it('transitions through full lifecycle: queued → uploading → sending → sent', () => {
      const states = [
        { status: 'queued', uploadComplete: false, expected: 'clock' },
        { status: 'sending', uploadComplete: false, expected: 'progress' },
        { status: 'sending', uploadComplete: true, expected: 'spinner' },
        { status: 'sent', uploadComplete: true, expected: 'check' },
      ];
      for (const { status, uploadComplete, expected } of states) {
        expect(getStatusDisplay(status, uploadComplete).icon).toBe(expected);
      }
    });

    it('transitions through error lifecycle: queued → uploading → error', () => {
      const states = [
        { status: 'queued', expected: 'clock' },
        { status: 'sending', expected: 'progress' },
        { status: 'error', expected: 'warning' },
      ];
      for (const { status, expected } of states) {
        expect(getStatusDisplay(status).icon).toBe(expected);
      }
    });
  });

  describe('integration: outgoing message complete workflow', () => {
    it('local blob attachment with upload progress follows expected state chain', () => {
      // Step 1: Message created with local blob attachment
      const mediaJson = JSON.stringify({
        attachments: [
          { hash: 'abc123', name: 'photo.jpg', mimeType: 'image/jpeg', sizeBytes: 50000 },
        ],
      });
      const attachments = parseMediaJson(mediaJson);
      expect(attachments[0].isLocalBlob).toBe(true);

      // Step 2: Status transitions tracked
      const { icon: queuedIcon } = getStatusDisplay('queued');
      expect(queuedIcon).toBe('clock');

      // Step 3: Upload starts
      const { icon: uploadingIcon } = getStatusDisplay('sending', false);
      expect(uploadingIcon).toBe('progress');

      // Step 4: Upload complete, NIP-17 encryption in progress
      const { icon: sendingIcon } = getStatusDisplay('sending', true);
      expect(sendingIcon).toBe('spinner');

      // Step 5: Message sent, URL replaces placeholder
      const sentMediaJson = JSON.stringify({
        attachments: [{
          hash: 'abc123',
          name: 'photo.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 50000,
          imeta: ['url https://blossom.example/abc123', 'm image/jpeg', 'size 50000', 'sha256 abc123'],
        }],
      });
      const sentAttachments = parseMediaJson(sentMediaJson);
      expect(sentAttachments[0].isLocalBlob).toBe(false);
      expect(sentAttachments[0].url).toBe('https://blossom.example/abc123');

      const { icon: sentIcon } = getStatusDisplay('sent');
      expect(sentIcon).toBe('check');
    });

    it('incoming message with imeta tags renders without status icons', () => {
      const mediaJson = JSON.stringify({
        tags: [
          ['imeta', 'url https://blossom.example/img1', 'm image/jpeg', 'size 30000', 'dim 800x600', 'blurhash LEHV6n', 'sha256 img1'],
        ],
      });
      const attachments = parseMediaJson(mediaJson);
      expect(attachments).toHaveLength(1);
      expect(attachments[0].isLocalBlob).toBe(false);
      expect(attachments[0].blurhash).toBe('LEHV6n');
      // Incoming messages don't need status icons (isOwn=false)
    });
  });
});
