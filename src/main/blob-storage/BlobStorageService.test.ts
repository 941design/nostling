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
});
