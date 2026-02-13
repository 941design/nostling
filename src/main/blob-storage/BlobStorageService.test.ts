/**
 * BlobStorageService Tests
 *
 * Property-based and integration tests for blob storage with streaming SHA-256,
 * metadata extraction, EXIF stripping, and deduplication.
 */

import { BlobStorageService, BlobMetadata, StoreBlobResult } from './BlobStorageService';
import { initDatabase, closeDatabase, _resetDatabaseState } from '../database/connection';
import { runMigrations } from '../database/migrations';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import { createHash } from 'crypto';
import fc from 'fast-check';

// Mock electron app module
jest.mock('electron', () => {
  let mockUserDataPath: string | null = null;

  return {
    app: {
      getPath: (pathType: string) => {
        if (pathType === 'userData') {
          if (!mockUserDataPath) {
            throw new Error('Mock userData path not set');
          }
          return mockUserDataPath;
        }
        throw new Error(`Unknown path type: ${pathType}`);
      },
      setMockUserDataPath: (userDataPath: string) => {
        mockUserDataPath = userDataPath;
      },
    },
  };
});

const { app } = require('electron');

describe('BlobStorageService', () => {
  let testDir: string;
  let blobsDir: string;
  let service: BlobStorageService;

  beforeEach(async () => {
    _resetDatabaseState();
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blob-storage-test-'));
    app.setMockUserDataPath(testDir);
    blobsDir = path.join(testDir, 'blobs');

    // Initialize database
    const db = await initDatabase();
    await runMigrations(db);

    service = new BlobStorageService(blobsDir);
    await service.initialize();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await closeDatabase();
    _resetDatabaseState();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('Initialization', () => {
    it('creates blobs directory with secure permissions', async () => {
      const stats = await fs.stat(blobsDir);
      expect(stats.isDirectory()).toBe(true);

      // Check permissions (0o700 = rwx------)
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o700);
    });

    it('is idempotent - can be called multiple times', async () => {
      await service.initialize();
      await service.initialize();

      const stats = await fs.stat(blobsDir);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('Streaming SHA-256 Hashing', () => {
    it('computes correct hash for small file', async () => {
      const content = 'Hello, World!';
      const filePath = path.join(testDir, 'test.txt');
      await fs.writeFile(filePath, content);

      const expectedHash = createHash('sha256').update(content).digest('hex');

      const result = await service.storeBlob(filePath);
      expect(result.hash).toBe(expectedHash);
    });

    it('computes correct hash for large file', async () => {
      // Create 10 MB file
      const size = 10 * 1024 * 1024;
      const buffer = Buffer.alloc(size, 'a');
      const filePath = path.join(testDir, 'large.bin');
      await fs.writeFile(filePath, buffer);

      const expectedHash = createHash('sha256').update(buffer).digest('hex');

      const result = await service.storeBlob(filePath);
      expect(result.hash).toBe(expectedHash);
    }, 30000);

    it('produces deterministic hashes for same content', async () => {
      const content = 'test content';
      const file1 = path.join(testDir, 'file1.txt');
      const file2 = path.join(testDir, 'file2.txt');

      await fs.writeFile(file1, content);
      await fs.writeFile(file2, content);

      const result1 = await service.storeBlob(file1);
      const result2 = await service.storeBlob(file2);

      expect(result1.hash).toBe(result2.hash);
      expect(result2.deduplicated).toBe(true);
    });

    it('property: hash is deterministic for same content', async () => {
      await fc.assert(
        fc.asyncProperty(fc.string(), async (content) => {
          const file1 = path.join(testDir, 'prop1.txt');
          const file2 = path.join(testDir, 'prop2.txt');

          await fs.writeFile(file1, content);
          await fs.writeFile(file2, content);

          const hash1 = createHash('sha256').update(content).digest('hex');
          const hash2 = createHash('sha256').update(content).digest('hex');

          expect(hash1).toBe(hash2);
        })
      );
    });

    it('property: different content produces different hashes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string().filter(s => s.length > 0),
          fc.string().filter(s => s.length > 0),
          async (content1, content2) => {
            fc.pre(content1 !== content2);

            const hash1 = createHash('sha256').update(content1).digest('hex');
            const hash2 = createHash('sha256').update(content2).digest('hex');

            expect(hash1).not.toBe(hash2);
          }
        )
      );
    });

    it('property: streaming hash matches direct hash for varying sizes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 0, maxLength: 1024 * 100 }),
          async (content) => {
            const filePath = path.join(testDir, 'stream-test.bin');
            await fs.writeFile(filePath, content);

            const result = await service.storeBlob(filePath);
            const expectedHash = createHash('sha256').update(content).digest('hex');

            expect(result.hash).toBe(expectedHash);
          }
        ),
        { numRuns: 15 }
      );
    });
  });

  describe('MIME Type Detection', () => {
    it('detects PNG image', async () => {
      const filePath = path.join(testDir, 'test.png');
      await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 1 }
        }
      }).png().toFile(filePath);

      const result = await service.storeBlob(filePath);
      expect(result.metadata.mimeType).toBe('image/png');
    });

    it('detects JPEG image', async () => {
      const filePath = path.join(testDir, 'test.jpg');
      await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 0, g: 255, b: 0 }
        }
      }).jpeg().toFile(filePath);

      const result = await service.storeBlob(filePath);
      expect(result.metadata.mimeType).toBe('image/jpeg');
    });

    it('returns application/octet-stream for unknown types', async () => {
      const filePath = path.join(testDir, 'unknown.bin');
      await fs.writeFile(filePath, Buffer.from([0x00, 0x01, 0x02, 0x03]));

      const result = await service.storeBlob(filePath);
      expect(result.metadata.mimeType).toBe('application/octet-stream');
    });
  });

  describe('Image Metadata Extraction', () => {
    it('extracts dimensions for PNG', async () => {
      const width = 320;
      const height = 240;
      const filePath = path.join(testDir, 'sized.png');

      await sharp({
        create: {
          width,
          height,
          channels: 4,
          background: { r: 100, g: 150, b: 200, alpha: 1 }
        }
      }).png().toFile(filePath);

      const result = await service.storeBlob(filePath);
      expect(result.metadata.dimensions).toEqual({ width, height });
    });

    it('generates blurhash for images', async () => {
      const filePath = path.join(testDir, 'blurhash.png');
      await sharp({
        create: {
          width: 200,
          height: 150,
          channels: 4,
          background: { r: 50, g: 100, b: 200, alpha: 1 }
        }
      }).png().toFile(filePath);

      const result = await service.storeBlob(filePath);
      expect(result.metadata.blurhash).toBeDefined();
      expect(typeof result.metadata.blurhash).toBe('string');
      expect(result.metadata.blurhash!.length).toBeGreaterThan(0);
    });

    it('does not set dimensions for non-images', async () => {
      const filePath = path.join(testDir, 'text.txt');
      await fs.writeFile(filePath, 'Plain text content');

      const result = await service.storeBlob(filePath);
      expect(result.metadata.dimensions).toBeUndefined();
      expect(result.metadata.blurhash).toBeUndefined();
    });
  });

  describe('EXIF Stripping', () => {
    it('strips EXIF from JPEG images', async () => {
      // Create JPEG with EXIF metadata
      const filePath = path.join(testDir, 'with-exif.jpg');
      await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 200, g: 100, b: 50 }
        }
      })
      .jpeg()
      .withMetadata({
        exif: {
          IFD0: {
            Copyright: 'Test Copyright',
            Make: 'Test Camera',
          }
        }
      })
      .toFile(filePath);

      const result = await service.storeBlob(filePath);

      // Verify stored blob has no EXIF
      const storedImage = sharp(result.metadata.localPath);
      const storedMetadata = await storedImage.metadata();

      expect(storedMetadata.exif).toBeUndefined();
    });

    it('handles images without EXIF gracefully', async () => {
      const filePath = path.join(testDir, 'no-exif.png');
      await sharp({
        create: {
          width: 50,
          height: 50,
          channels: 4,
          background: { r: 128, g: 128, b: 128, alpha: 1 }
        }
      }).png().toFile(filePath);

      const result = await service.storeBlob(filePath);
      expect(result.metadata.hash).toBeDefined();
      expect(result.metadata.dimensions).toEqual({ width: 50, height: 50 });
    });

    it('handles corrupted/non-image files as binary', async () => {
      // File with .jpg extension but invalid content
      const filePath = path.join(testDir, 'corrupted.jpg');
      await fs.writeFile(filePath, Buffer.from('not a valid JPEG'));

      // Should succeed but treat as binary (application/octet-stream)
      const result = await service.storeBlob(filePath);
      expect(result.metadata.mimeType).toBe('application/octet-stream');
      expect(result.metadata.dimensions).toBeUndefined();
      expect(result.metadata.blurhash).toBeUndefined();
    });

    it('throws error when sharp fails during rotate (EXIF stripping)', async () => {
      // Create valid JPEG
      const filePath = path.join(testDir, 'sharp-fail.jpg');
      await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 200, g: 100, b: 50 }
        }
      }).jpeg().toFile(filePath);

      // Spy on sharp instance's rotate method
      const rotateSpy = jest.spyOn(sharp.prototype as any, 'rotate').mockImplementation(() => {
        throw new Error('Sharp rotate failed');
      });

      await expect(service.storeBlob(filePath)).rejects.toThrow('Failed to process image');

      rotateSpy.mockRestore();
    });

    it('throws error when sharp metadata extraction fails', async () => {
      // Create valid JPEG to ensure MIME detection treats it as image
      const filePath = path.join(testDir, 'metadata-fail.jpg');
      await sharp({
        create: {
          width: 50,
          height: 50,
          channels: 3,
          background: { r: 128, g: 128, b: 128 }
        }
      }).jpeg().toFile(filePath);

      // Spy on sharp instance's metadata method
      // We need it to succeed first for MIME detection, then fail for extractImageMetadata
      let callCount = 0;
      const metadataSpy = jest.spyOn(sharp.prototype as any, 'metadata').mockImplementation(async function(this: any) {
        callCount++;
        if (callCount === 1) {
          // First call: MIME detection - succeed
          return { format: 'jpeg' };
        } else {
          // Second call: extractImageMetadata - fail
          throw new Error('Metadata extraction failed');
        }
      });

      await expect(service.storeBlob(filePath)).rejects.toThrow('Failed to process image');

      metadataSpy.mockRestore();
    });
  });

  describe('Blob Storage', () => {
    it('stores blob with correct permissions', async () => {
      const filePath = path.join(testDir, 'perms.txt');
      await fs.writeFile(filePath, 'test content');

      const result = await service.storeBlob(filePath);

      const stats = await fs.stat(result.metadata.localPath);
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600); // rw-------
    });

    it('stores blob at correct path', async () => {
      const content = 'blob content';
      const filePath = path.join(testDir, 'blob.txt');
      await fs.writeFile(filePath, content);

      const result = await service.storeBlob(filePath);

      const expectedPath = path.join(blobsDir, result.hash);
      expect(result.metadata.localPath).toBe(expectedPath);

      const storedContent = await fs.readFile(result.metadata.localPath, 'utf-8');
      expect(storedContent).toBe(content);
    });

    it('persists metadata to database', async () => {
      const filePath = path.join(testDir, 'db-test.txt');
      await fs.writeFile(filePath, 'database test');

      const result = await service.storeBlob(filePath);

      // Retrieve via getBlob to verify database persistence
      const retrieved = await service.getBlob(result.hash);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.mimeType).toBe(result.metadata.mimeType);
      expect(retrieved!.sizeBytes).toBe(result.metadata.sizeBytes);
      expect(retrieved!.localPath).toBe(result.metadata.localPath);
    });
  });

  describe('Deduplication', () => {
    it('deduplicates identical files', async () => {
      const content = 'duplicate content';
      const file1 = path.join(testDir, 'dup1.txt');
      const file2 = path.join(testDir, 'dup2.txt');

      await fs.writeFile(file1, content);
      await fs.writeFile(file2, content);

      const result1 = await service.storeBlob(file1);
      expect(result1.deduplicated).toBe(false);

      const result2 = await service.storeBlob(file2);
      expect(result2.deduplicated).toBe(true);
      expect(result2.hash).toBe(result1.hash);

      // Verify retrieval still works (database entry exists)
      const retrieved = await service.getBlob(result1.hash);
      expect(retrieved).not.toBeNull();
    });

    it('property: deduplication preserves content', async () => {
      await fc.assert(
        fc.asyncProperty(fc.string({ minLength: 1 }), async (content) => {
          const file1 = path.join(testDir, 'prop-dup1.txt');
          const file2 = path.join(testDir, 'prop-dup2.txt');

          await fs.writeFile(file1, content);
          await fs.writeFile(file2, content);

          const result1 = await service.storeBlob(file1);
          const result2 = await service.storeBlob(file2);

          expect(result1.hash).toBe(result2.hash);
          expect(result2.deduplicated).toBe(true);

          const stored = await fs.readFile(result2.metadata.localPath, 'utf-8');
          expect(stored).toBe(content);
        })
      );
    });
  });

  describe('Blob Retrieval', () => {
    it('retrieves existing blob', async () => {
      const content = 'retrieve test';
      const filePath = path.join(testDir, 'retrieve.txt');
      await fs.writeFile(filePath, content);

      const stored = await service.storeBlob(filePath);
      const retrieved = await service.getBlob(stored.hash);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.hash).toBe(stored.hash);
      expect(retrieved!.mimeType).toBe(stored.metadata.mimeType);
      expect(retrieved!.sizeBytes).toBe(stored.metadata.sizeBytes);
    });

    it('returns null for non-existent hash', async () => {
      const retrieved = await service.getBlob('0000000000000000000000000000000000000000000000000000000000000000');
      expect(retrieved).toBeNull();
    });

    it('returns null if file is missing', async () => {
      const filePath = path.join(testDir, 'missing.txt');
      await fs.writeFile(filePath, 'will be deleted');

      const stored = await service.storeBlob(filePath);

      // Delete the blob file
      await fs.unlink(stored.metadata.localPath);

      const retrieved = await service.getBlob(stored.hash);
      expect(retrieved).toBeNull();
    });
  });

  describe('Blob Deletion', () => {
    it('deletes blob and metadata', async () => {
      const filePath = path.join(testDir, 'delete.txt');
      await fs.writeFile(filePath, 'to be deleted');

      const stored = await service.storeBlob(filePath);
      const deleted = await service.deleteBlob(stored.hash);

      expect(deleted).toBe(true);

      // Verify file deleted
      await expect(fs.access(stored.metadata.localPath)).rejects.toThrow();

      // Verify metadata deleted (getBlob returns null)
      const retrieved = await service.getBlob(stored.hash);
      expect(retrieved).toBeNull();
    });

    it('returns false for non-existent blob', async () => {
      const deleted = await service.deleteBlob('nonexistent');
      expect(deleted).toBe(false);
    });

    it('is idempotent', async () => {
      const filePath = path.join(testDir, 'idempotent.txt');
      await fs.writeFile(filePath, 'test');

      const stored = await service.storeBlob(filePath);

      const deleted1 = await service.deleteBlob(stored.hash);
      expect(deleted1).toBe(true);

      const deleted2 = await service.deleteBlob(stored.hash);
      expect(deleted2).toBe(false);
    });
  });

  describe('Integration: Complete Workflow', () => {
    it('stores, retrieves, and deletes blob successfully', async () => {
      const content = 'integration test content';
      const filePath = path.join(testDir, 'integration.txt');
      await fs.writeFile(filePath, content);

      // Store
      const stored = await service.storeBlob(filePath);
      expect(stored.hash).toBeDefined();
      expect(stored.deduplicated).toBe(false);

      // Retrieve
      const retrieved = await service.getBlob(stored.hash);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.hash).toBe(stored.hash);

      const fileContent = await fs.readFile(retrieved!.localPath, 'utf-8');
      expect(fileContent).toBe(content);

      // Delete
      const deleted = await service.deleteBlob(stored.hash);
      expect(deleted).toBe(true);

      // Verify deleted
      const afterDelete = await service.getBlob(stored.hash);
      expect(afterDelete).toBeNull();
    });

    it('handles image with dimensions and blurhash', async () => {
      const width = 400;
      const height = 300;
      const filePath = path.join(testDir, 'complete-image.png');

      await sharp({
        create: {
          width,
          height,
          channels: 4,
          background: { r: 255, g: 128, b: 64, alpha: 1 }
        }
      }).png().toFile(filePath);

      // Store
      const stored = await service.storeBlob(filePath);
      expect(stored.metadata.mimeType).toBe('image/png');
      expect(stored.metadata.dimensions).toEqual({ width, height });
      expect(stored.metadata.blurhash).toBeDefined();

      // Retrieve
      const retrieved = await service.getBlob(stored.hash);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.dimensions).toEqual({ width, height });
      expect(retrieved!.blurhash).toBe(stored.metadata.blurhash);

      // Verify EXIF stripped
      const storedImage = sharp(retrieved!.localPath);
      const metadata = await storedImage.metadata();
      expect(metadata.exif).toBeUndefined();
    });

    it('handles multiple blobs concurrently', async () => {
      const files = await Promise.all(
        Array.from({ length: 5 }, async (_, i) => {
          const filePath = path.join(testDir, `concurrent-${i}.txt`);
          await fs.writeFile(filePath, `content ${i}`);
          return filePath;
        })
      );

      const results = await Promise.all(
        files.map(file => service.storeBlob(file))
      );

      expect(results).toHaveLength(5);

      // All should have unique hashes
      const hashes = results.map(r => r.hash);
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(5);

      // All should be retrievable
      const retrieved = await Promise.all(
        hashes.map(hash => service.getBlob(hash))
      );

      expect(retrieved.every(r => r !== null)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('throws when not initialized', async () => {
      const uninitializedService = new BlobStorageService(blobsDir);
      const filePath = path.join(testDir, 'test.txt');
      await fs.writeFile(filePath, 'test');

      await expect(uninitializedService.storeBlob(filePath)).rejects.toThrow('not initialized');
    });

    it('throws for non-existent file', async () => {
      const nonExistentPath = path.join(testDir, 'does-not-exist.txt');
      await expect(service.storeBlob(nonExistentPath)).rejects.toThrow();
    });
  });

  describe('Storage cleanup and quota enforcement (Story 10)', () => {
    // Helper: store a test blob and mark it as uploaded in message_media
    async function storeAndUpload(
      svc: BlobStorageService,
      name: string,
      content: string,
      uploadedAtUnix: number,
      messageId: string = `msg-${name}`
    ): Promise<string> {
      const filePath = path.join(testDir, name);
      await fs.writeFile(filePath, content);
      const result = await svc.storeBlob(filePath);

      const db = require('../database/connection').getDatabase();
      // Mark uploaded_at in media_blobs
      db.run('UPDATE media_blobs SET uploaded_at = ? WHERE hash = ?', [uploadedAtUnix, result.hash]);

      // Ensure nostr_messages row exists (FK constraint)
      db.run(
        "INSERT OR IGNORE INTO nostr_messages (id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, timestamp, status, direction, is_read) VALUES (?, 'id1', 'c1', 'npub1', 'npub2', 'text', datetime('now'), 'sent', 'outgoing', 1)",
        [messageId]
      );

      // Add message_media reference
      db.run(
        "INSERT INTO message_media (message_id, blob_hash, upload_status) VALUES (?, ?, 'uploaded')",
        [messageId, result.hash]
      );

      return result.hash;
    }

    describe('getStorageUsage (AC-035)', () => {
      it('returns 0 when no blobs stored', () => {
        expect(service.getStorageUsage()).toBe(0);
      });

      it('returns total size of all blobs', async () => {
        const f1 = path.join(testDir, 'a.txt');
        const f2 = path.join(testDir, 'b.txt');
        await fs.writeFile(f1, 'hello'); // 5 bytes
        await fs.writeFile(f2, 'world!!!'); // 8 bytes
        await service.storeBlob(f1);
        await service.storeBlob(f2);
        expect(service.getStorageUsage()).toBe(13);
      });
    });

    describe('deleteExpiredBlobs (AC-034)', () => {
      it('deletes uploaded blobs past retention period', async () => {
        const now = Date.now();
        const eightDaysAgo = Math.floor(now / 1000) - (8 * 24 * 60 * 60);

        const hash = await storeAndUpload(service, 'old.txt', 'old-content', eightDaysAgo);

        const deleted = await service.runCleanup(7, 500 * 1024 * 1024, now);
        expect(deleted).toBe(1);

        const blob = await service.getBlob(hash);
        expect(blob).toBeNull();
      });

      it('retains uploaded blobs within retention period', async () => {
        const now = Date.now();
        const threeDaysAgo = Math.floor(now / 1000) - (3 * 24 * 60 * 60);

        const hash = await storeAndUpload(service, 'recent.txt', 'recent-content', threeDaysAgo);

        const deleted = await service.runCleanup(7, 500 * 1024 * 1024, now);
        expect(deleted).toBe(0);

        const blob = await service.getBlob(hash);
        expect(blob).not.toBeNull();
      });

      it('retains blobs that have not been uploaded yet', async () => {
        const filePath = path.join(testDir, 'pending.txt');
        await fs.writeFile(filePath, 'pending-content');
        const result = await service.storeBlob(filePath);

        // uploaded_at is null (not uploaded yet)
        const deleted = await service.runCleanup(7, 500 * 1024 * 1024);
        expect(deleted).toBe(0);

        const blob = await service.getBlob(result.hash);
        expect(blob).not.toBeNull();
      });
    });

    describe('multi-identity retention (AC-046)', () => {
      it('retains blob when any message_media reference is still pending', async () => {
        const now = Date.now();
        const eightDaysAgo = Math.floor(now / 1000) - (8 * 24 * 60 * 60);

        // Store blob and create uploaded reference for Identity A
        const hash = await storeAndUpload(service, 'shared.txt', 'shared-content', eightDaysAgo, 'msg-a');

        const db = require('../database/connection').getDatabase();
        // Add second reference for Identity B (still pending)
        db.run(
          "INSERT OR IGNORE INTO nostr_messages (id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, timestamp, status, direction, is_read) VALUES ('msg-b', 'id2', 'c2', 'npub3', 'npub4', 'text', datetime('now'), 'queued', 'outgoing', 0)"
        );
        db.run(
          "INSERT INTO message_media (message_id, blob_hash, upload_status) VALUES ('msg-b', ?, 'pending')",
          [hash]
        );

        // Cleanup should NOT delete because msg-b reference is 'pending'
        const deleted = await service.runCleanup(7, 500 * 1024 * 1024, now);
        expect(deleted).toBe(0);

        const blob = await service.getBlob(hash);
        expect(blob).not.toBeNull();
      });

      it('deletes blob when all message_media references are uploaded', async () => {
        const now = Date.now();
        const eightDaysAgo = Math.floor(now / 1000) - (8 * 24 * 60 * 60);

        const hash = await storeAndUpload(service, 'multi.txt', 'multi-content', eightDaysAgo, 'msg-x');

        const db = require('../database/connection').getDatabase();
        // Add second uploaded reference
        db.run(
          "INSERT OR IGNORE INTO nostr_messages (id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, timestamp, status, direction, is_read) VALUES ('msg-y', 'id2', 'c2', 'npub3', 'npub4', 'text', datetime('now'), 'sent', 'outgoing', 1)"
        );
        db.run(
          "INSERT INTO message_media (message_id, blob_hash, upload_status) VALUES ('msg-y', ?, 'uploaded')",
          [hash]
        );

        // Both references are 'uploaded', blob past retention → delete
        const deleted = await service.runCleanup(7, 500 * 1024 * 1024, now);
        expect(deleted).toBe(1);

        const blob = await service.getBlob(hash);
        expect(blob).toBeNull();
      });
    });

    describe('edge cases', () => {
      it('retains blob uploaded at exactly the retention boundary', async () => {
        const now = Date.now();
        // Exactly 7 days ago (at the cutoff) — should NOT be deleted (uses strict <)
        const exactlySeven = Math.floor(now / 1000) - (7 * 24 * 60 * 60);

        const hash = await storeAndUpload(service, 'boundary.txt', 'boundary-content', exactlySeven);

        const deleted = await service.runCleanup(7, 500 * 1024 * 1024, now);
        expect(deleted).toBe(0);

        const blob = await service.getBlob(hash);
        expect(blob).not.toBeNull();
      });

      it('deletes orphaned blob with no message_media references', async () => {
        const now = Date.now();
        const eightDaysAgo = Math.floor(now / 1000) - (8 * 24 * 60 * 60);

        // Store blob and manually set uploaded_at, but do NOT add any message_media row
        const filePath = path.join(testDir, 'orphan.txt');
        await fs.writeFile(filePath, 'orphan-content');
        const result = await service.storeBlob(filePath);

        const db = require('../database/connection').getDatabase();
        db.run('UPDATE media_blobs SET uploaded_at = ? WHERE hash = ?', [eightDaysAgo, result.hash]);

        // No message_media references at all → NOT EXISTS subquery is vacuously true → deletable
        const deleted = await service.runCleanup(7, 500 * 1024 * 1024, now);
        expect(deleted).toBe(1);

        const blob = await service.getBlob(result.hash);
        expect(blob).toBeNull();
      });

      it('retains blob with uploading status in message_media', async () => {
        const now = Date.now();
        const eightDaysAgo = Math.floor(now / 1000) - (8 * 24 * 60 * 60);

        const filePath = path.join(testDir, 'uploading.txt');
        await fs.writeFile(filePath, 'uploading-content');
        const result = await service.storeBlob(filePath);

        const db = require('../database/connection').getDatabase();
        db.run('UPDATE media_blobs SET uploaded_at = ? WHERE hash = ?', [eightDaysAgo, result.hash]);

        // Create message_media with 'uploading' status
        db.run(
          "INSERT OR IGNORE INTO nostr_messages (id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, timestamp, status, direction, is_read) VALUES ('msg-upl', 'id1', 'c1', 'npub1', 'npub2', 'text', datetime('now'), 'queued', 'outgoing', 0)"
        );
        db.run(
          "INSERT INTO message_media (message_id, blob_hash, upload_status) VALUES ('msg-upl', ?, 'uploading')",
          [result.hash]
        );

        const deleted = await service.runCleanup(7, 500 * 1024 * 1024, now);
        expect(deleted).toBe(0);

        expect(await service.getBlob(result.hash)).not.toBeNull();
      });

      it('retains blob referenced by same identity across multiple messages when any is pending', async () => {
        const now = Date.now();
        const eightDaysAgo = Math.floor(now / 1000) - (8 * 24 * 60 * 60);

        // Store blob with one uploaded reference
        const hash = await storeAndUpload(service, 'same-id.txt', 'same-id-content', eightDaysAgo, 'msg-s1');

        const db = require('../database/connection').getDatabase();
        // Second message from same identity, still pending
        db.run(
          "INSERT OR IGNORE INTO nostr_messages (id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, timestamp, status, direction, is_read) VALUES ('msg-s2', 'id1', 'c1', 'npub1', 'npub2', 'text', datetime('now'), 'queued', 'outgoing', 0)"
        );
        db.run(
          "INSERT INTO message_media (message_id, blob_hash, upload_status) VALUES ('msg-s2', ?, 'pending')",
          [hash]
        );

        const deleted = await service.runCleanup(7, 500 * 1024 * 1024, now);
        expect(deleted).toBe(0);

        expect(await service.getBlob(hash)).not.toBeNull();
      });
    });

    describe('quota enforcement with LRU eviction (AC-035)', () => {
      it('evicts oldest uploaded blobs when quota exceeded', async () => {
        const now = Date.now();
        const twoDaysAgo = Math.floor(now / 1000) - (2 * 24 * 60 * 60);
        const oneDayAgo = Math.floor(now / 1000) - (1 * 24 * 60 * 60);

        // Store two blobs: old (5 bytes) and new (5 bytes) = 10 bytes total
        const oldHash = await storeAndUpload(service, 'old-q.txt', 'aaaaa', twoDaysAgo, 'msg-old');
        const newHash = await storeAndUpload(service, 'new-q.txt', 'bbbbb', oneDayAgo, 'msg-new');

        expect(service.getStorageUsage()).toBe(10);

        // Set quota to 6 bytes - need to evict oldest to fit
        const deleted = await service.runCleanup(30, 6, now); // High retention so only quota applies
        expect(deleted).toBe(1);

        // Old blob evicted (LRU), new blob retained
        expect(await service.getBlob(oldHash)).toBeNull();
        expect(await service.getBlob(newHash)).not.toBeNull();
      });

      it('never evicts unuploaded blobs even when over quota', async () => {
        const now = Date.now();
        const oneDayAgo = Math.floor(now / 1000) - (1 * 24 * 60 * 60);

        // Store uploaded blob (5 bytes)
        await storeAndUpload(service, 'uploaded-q.txt', 'xxxxx', oneDayAgo, 'msg-up');

        // Store unuploaded blob (5 bytes) - no uploaded_at, no message_media
        const pendingFile = path.join(testDir, 'pending-q.txt');
        await fs.writeFile(pendingFile, 'yyyyy');
        const pendingResult = await service.storeBlob(pendingFile);

        expect(service.getStorageUsage()).toBe(10);

        // Quota 3 bytes - needs eviction but only uploaded are eligible
        const deleted = await service.runCleanup(30, 3, now);
        expect(deleted).toBe(1); // Only the uploaded one

        // Pending blob still exists
        expect(await service.getBlob(pendingResult.hash)).not.toBeNull();
        expect(service.getStorageUsage()).toBe(5); // Only pending remains
      });
    });
  });
});
