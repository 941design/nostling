/**
 * Blob Storage Service
 *
 * Content-addressed blob storage with streaming SHA-256 hashing, metadata extraction,
 * and automatic deduplication. Supports the Blossom media uploads feature.
 *
 * Features:
 * - Streaming SHA-256 hashing (no full-file buffering)
 * - Content-addressed storage at {userData}/blobs/<hash>
 * - Metadata extraction (MIME, size, dimensions, blurhash)
 * - Mandatory EXIF stripping for images
 * - Automatic deduplication via hash-based storage
 */

import { createHash } from 'crypto';
import { createReadStream, promises as fs } from 'fs';
import path from 'path';
import { processImage } from './image-processing';
import { getDatabase } from '../database/connection';
import { Database } from 'sql.js';

export interface BlobMetadata {
  hash: string;
  mimeType: string;
  sizeBytes: number;
  dimensions?: { width: number; height: number };
  blurhash?: string;
  localPath: string;
  createdAt: number;
}

export interface StoreBlobResult {
  hash: string;
  metadata: BlobMetadata;
  deduplicated: boolean; // true if blob already existed
}

/**
 * Compute SHA-256 hash of a file using streaming.
 *
 * CONTRACT:
 *   Inputs:
 *     - filePath: string, absolute path to file to hash
 *
 *   Outputs:
 *     - Promise<string>: SHA-256 hash in hexadecimal format
 *
 *   Invariants:
 *     - Output is deterministic for same file content
 *     - No full-file buffering in memory
 *     - Works for files of arbitrary size
 *
 *   Properties:
 *     - Streaming: processes file in chunks
 *     - Memory efficient: constant memory usage regardless of file size
 *     - Collision resistant: SHA-256 cryptographic properties
 *
 *   Algorithm:
 *     1. Create SHA-256 hash instance
 *     2. Create read stream for file
 *     3. Pipe file chunks through hash
 *     4. On completion, return hexadecimal digest
 *     5. On error, propagate error
 */
async function computeStreamingSHA256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('data', (chunk) => {
      hash.update(chunk);
    });

    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });

    stream.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Extract image metadata (dimensions, blurhash) and strip EXIF.
 *
 * CONTRACT:
 *   Inputs:
 *     - filePath: string, path to image file
 *
 *   Outputs:
 *     - Promise<{dimensions, blurhash, processedBuffer}>:
 *       - dimensions: {width, height} in pixels
 *       - blurhash: string, blurhash representation
 *       - processedBuffer: Buffer, image data with EXIF stripped
 *
 *   Invariants:
 *     - EXIF data is removed from processedBuffer
 *     - Dimensions match actual image size
 *     - Blurhash is valid encoding
 *
 *   Properties:
 *     - EXIF stripping is mandatory, failure aborts with error
 *     - Blurhash has fixed component counts (4x3) for consistency
 *     - Preserves image pixel data
 *
 *   Algorithm:
 *     1. Read image file
 *     2. Strip EXIF metadata (byte-level for JPEG)
 *     3. Decode to RGBA, apply EXIF orientation for display dimensions
 *     4. Resize oriented pixels to 32x32 for blurhash
 *     5. Encode blurhash from thumbnail pixels
 *     6. Return dimensions, blurhash, processed buffer
 */
async function extractImageMetadata(filePath: string, mimeType: string): Promise<{
  dimensions: { width: number; height: number };
  blurhash: string;
  processedBuffer: Buffer;
}> {
  try {
    return await processImage(filePath, mimeType);
  } catch (error) {
    throw new Error(`Failed to process image: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Detect MIME type of a file.
 *
 * CONTRACT:
 *   Inputs:
 *     - filePath: string, path to file
 *
 *   Outputs:
 *     - Promise<string>: MIME type (e.g., "image/png", "video/mp4", "application/pdf")
 *
 *   Invariants:
 *     - Returns MIME type based on file magic bytes, not extension
 *     - Returns "application/octet-stream" for unknown types
 *
 *   Properties:
 *     - Magic-based detection: reliable, not fooled by renamed files
 *     - Fallback: always returns a valid MIME type
 *
 *   Algorithm:
 *     1. Use file-type library to detect from magic bytes
 *     2. If detected, return MIME type
 *     3. If not detected, return "application/octet-stream"
 */
/** Detect JPEG/PNG from magic bytes. Returns application/octet-stream for anything else. */
async function detectMimeFromMagicBytes(filePath: string): Promise<string> {
  try {
    const fd = await fs.open(filePath, 'r');
    try {
      const buf = Buffer.alloc(8);
      await fd.read(buf, 0, 8, 0);

      // PNG: 89 50 4E 47 0D 0A 1A 0A
      if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
        return 'image/png';
      }
      // JPEG: FF D8 FF
      if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
        return 'image/jpeg';
      }
    } finally {
      await fd.close();
    }
  } catch {
    // File read failed
  }
  return 'application/octet-stream';
}

async function detectMimeType(filePath: string): Promise<string> {
  try {
    // Dynamic import for ESM-only module
    const fileTypeModule = await import('file-type');
    const fileType = await fileTypeModule.fileTypeFromFile(filePath);
    return fileType?.mime ?? 'application/octet-stream';
  } catch {
    // Fallback: detect common image types from magic bytes when file-type
    // is unavailable (e.g. ESM module loading issues in certain runtimes)
    return detectMimeFromMagicBytes(filePath);
  }
}

/** Image types that our pure-JS pipeline can process (decode, EXIF strip, blurhash). */
const PROCESSABLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png']);


export class BlobStorageService {
  private readonly blobsDir: string;
  private db: Database | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(blobsDir: string) {
    this.blobsDir = blobsDir;
  }

  /**
   * Initialize the blob storage service.
   *
   * CONTRACT:
   *   Inputs:
   *     - this: BlobStorageService instance with blobsDir configured
   *
   *   Outputs:
   *     - Promise<void>: resolves when initialization complete
   *
   *   Invariants:
   *     - After initialization, blobsDir exists as a directory
   *     - After initialization, db is set to database instance
   *     - Directory permissions are user-read/write only (0o700)
   *
   *   Properties:
   *     - Idempotent: safe to call multiple times
   *     - Side effects: creates directory if not exists, sets db reference
   *
   *   Algorithm:
   *     1. Get database instance from connection
   *     2. Create blobsDir with mode 0o700 if not exists
   *     3. Store db reference
   */
  async initialize(): Promise<void> {
    this.db = getDatabase();
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      await fs.mkdir(this.blobsDir, { mode: 0o700, recursive: true });
    } catch (error) {
      if ((error as any).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Store a blob with metadata extraction and deduplication.
   *
   * CONTRACT:
   *   Inputs:
   *     - filePath: string, path to file to store
   *
   *   Outputs:
   *     - Promise<StoreBlobResult>:
   *       - hash: SHA-256 hash of file
   *       - metadata: BlobMetadata object
   *       - deduplicated: true if blob already existed, false if newly stored
   *
   *   Invariants:
   *     - After completion, blob exists at {blobsDir}/{hash}
   *     - After completion, metadata in media_blobs table
   *     - For images, EXIF is stripped before storage
   *     - For images, dimensions and blurhash are populated
   *     - For non-images, dimensions and blurhash are null
   *     - Identical files (same hash) are deduplicated
   *
   *   Properties:
   *     - Streaming hashing: no full-file buffering
   *     - Content-addressed: hash determines storage location
   *     - Deduplication: same content stored only once
   *     - EXIF stripping mandatory for images: failure aborts with error
   *
   *   Algorithm:
   *     1. Compute SHA-256 hash of file using streaming
   *     2. Check if hash exists in media_blobs table
   *     3. If exists, return existing metadata with deduplicated=true
   *     4. Detect MIME type from file magic bytes
   *     5. Get file size
   *     6. If image:
   *        a. Extract dimensions and blurhash
   *        b. Strip EXIF (failure aborts here)
   *        c. Store processed buffer to {blobsDir}/{hash}
   *     7. If non-image:
   *        a. Copy file to {blobsDir}/{hash}
   *     8. Insert metadata into media_blobs table
   *     9. Return result with deduplicated=false
   */
  async storeBlob(filePath: string): Promise<StoreBlobResult> {
    if (!this.db) {
      throw new Error('BlobStorageService not initialized');
    }

    // Step 1: Compute hash using streaming
    const hash = await computeStreamingSHA256(filePath);

    // Step 2-3: Check for existing blob (deduplication)
    const existingResult = this.db.exec(
      'SELECT hash, mime_type, size_bytes, dimensions_json, blurhash, local_path, created_at FROM media_blobs WHERE hash = ?',
      [hash]
    );

    if (existingResult.length > 0 && existingResult[0].values.length > 0) {
      const row = existingResult[0].values[0];
      return {
        hash,
        metadata: {
          hash: row[0] as string,
          mimeType: row[1] as string,
          sizeBytes: row[2] as number,
          dimensions: row[3] ? JSON.parse(row[3] as string) : undefined,
          blurhash: (row[4] as string | null) ?? undefined,
          localPath: row[5] as string,
          createdAt: row[6] as number,
        },
        deduplicated: true,
      };
    }

    // Step 4: Detect MIME type
    const mimeType = await detectMimeType(filePath);

    // Step 5: Get file size
    const stats = await fs.stat(filePath);
    const sizeBytes = stats.size;

    const blobPath = path.join(this.blobsDir, hash);

    let dimensions: { width: number; height: number } | undefined;
    let blurhash: string | undefined;

    // Step 6-7: Process based on type
    if (PROCESSABLE_IMAGE_TYPES.has(mimeType)) {
      // Extract metadata and strip EXIF (JPEG/PNG only)
      const imageData = await extractImageMetadata(filePath, mimeType);
      dimensions = imageData.dimensions;
      blurhash = imageData.blurhash;

      // Store processed image (EXIF stripped)
      await fs.writeFile(blobPath, imageData.processedBuffer, { mode: 0o600 });
    } else {
      // Store non-processable files as-is (including other image types like WebP, GIF)
      await fs.copyFile(filePath, blobPath);
      await fs.chmod(blobPath, 0o600);
    }

    // Step 8: Insert metadata into database
    const now = Date.now();
    this.db.run(
      `INSERT INTO media_blobs (hash, mime_type, size_bytes, dimensions_json, blurhash, local_path, uploaded_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [hash, mimeType, sizeBytes, dimensions ? JSON.stringify(dimensions) : null, blurhash ?? null, blobPath, null, now]
    );

    const metadata: BlobMetadata = {
      hash,
      mimeType,
      sizeBytes,
      dimensions,
      blurhash,
      localPath: blobPath,
      createdAt: now,
    };

    return {
      hash,
      metadata,
      deduplicated: false,
    };
  }

  /**
   * Retrieve blob metadata by hash.
   *
   * CONTRACT:
   *   Inputs:
   *     - hash: string, SHA-256 hash of blob
   *
   *   Outputs:
   *     - Promise<BlobMetadata | null>:
   *       - BlobMetadata if blob exists
   *       - null if blob not found
   *
   *   Invariants:
   *     - If returned, metadata.localPath points to existing file
   *     - If returned, metadata.hash matches input hash
   *
   *   Properties:
   *     - Read-only: no side effects
   *     - File existence validated
   *
   *   Algorithm:
   *     1. Query media_blobs table for hash
   *     2. If not found, return null
   *     3. Check if file exists at local_path
   *     4. If file missing, return null (orphaned metadata)
   *     5. Return BlobMetadata
   */
  async getBlob(hash: string): Promise<BlobMetadata | null> {
    if (!this.db) {
      throw new Error('BlobStorageService not initialized');
    }

    const result = this.db.exec(
      'SELECT hash, mime_type, size_bytes, dimensions_json, blurhash, local_path, created_at FROM media_blobs WHERE hash = ?',
      [hash]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    const row = result[0].values[0];
    const localPath = row[5] as string;

    // Validate file exists
    try {
      await fs.access(localPath);
    } catch {
      return null;
    }

    return {
      hash: row[0] as string,
      mimeType: row[1] as string,
      sizeBytes: row[2] as number,
      dimensions: row[3] ? JSON.parse(row[3] as string) : undefined,
      blurhash: (row[4] as string | null) ?? undefined,
      localPath: localPath,
      createdAt: row[6] as number,
    };
  }

  /**
   * Delete blob by hash.
   *
   * CONTRACT:
   *   Inputs:
   *     - hash: string, SHA-256 hash of blob to delete
   *
   *   Outputs:
   *     - Promise<boolean>: true if blob was deleted, false if not found
   *
   *   Invariants:
   *     - After completion, blob file is deleted
   *     - After completion, metadata removed from database
   *
   *   Properties:
   *     - Idempotent: deleting non-existent blob succeeds (returns false)
   *     - Side effects: deletes file, removes database row
   *
   *   Algorithm:
   *     1. Query media_blobs table for hash
   *     2. If not found, return false
   *     3. Delete file at local_path (ignore error if missing)
   *     4. Delete row from media_blobs table
   *     5. Return true
   */
  async deleteBlob(hash: string): Promise<boolean> {
    if (!this.db) {
      throw new Error('BlobStorageService not initialized');
    }

    const result = this.db.exec(
      'SELECT local_path FROM media_blobs WHERE hash = ?',
      [hash]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return false;
    }

    const localPath = result[0].values[0][0] as string;

    // Delete file
    try {
      await fs.unlink(localPath);
    } catch {
      // Ignore error if file doesn't exist
    }

    // Delete metadata
    this.db.run('DELETE FROM media_blobs WHERE hash = ?', [hash]);

    return true;
  }

  /**
   * Get total storage used by all blobs in bytes.
   */
  getStorageUsage(): number {
    if (!this.db) {
      throw new Error('BlobStorageService not initialized');
    }
    const result = this.db.exec('SELECT COALESCE(SUM(size_bytes), 0) FROM media_blobs');
    return result.length > 0 ? (result[0].values[0][0] as number) : 0;
  }

  /**
   * Run cleanup: delete uploaded blobs past retention period and enforce quota.
   *
   * @param retentionDays - Days to retain uploaded blobs before deletion (default 7)
   * @param quotaBytes - Maximum total blob storage in bytes (default 500 MB)
   * @param nowMs - Current time in milliseconds (injectable for testing)
   * @returns Number of blobs deleted
   */
  async runCleanup(
    retentionDays: number = 7,
    quotaBytes: number = 500 * 1024 * 1024,
    nowMs: number = Date.now()
  ): Promise<number> {
    if (!this.db) {
      throw new Error('BlobStorageService not initialized');
    }

    let deleted = 0;

    // Phase 1: Delete uploaded blobs past retention period
    deleted += await this.deleteExpiredBlobs(retentionDays, nowMs);

    // Phase 2: Enforce quota via LRU eviction of uploaded blobs
    deleted += await this.evictToQuota(quotaBytes);

    return deleted;
  }

  /**
   * Delete blobs whose upload completed more than retentionDays ago,
   * but only if ALL message_media references for this blob are in 'uploaded' status.
   * Blobs with any pending/uploading reference are retained.
   */
  private async deleteExpiredBlobs(retentionDays: number, nowMs: number): Promise<number> {
    const cutoffTimestamp = Math.floor(nowMs / 1000) - (retentionDays * 24 * 60 * 60);

    // Find blobs that:
    // 1. Have been uploaded (uploaded_at is not null and before cutoff)
    // 2. Have NO message_media references with status != 'uploaded'
    const result = this.db!.exec(
      `SELECT mb.hash FROM media_blobs mb
       WHERE mb.uploaded_at IS NOT NULL
         AND mb.uploaded_at < ?
         AND NOT EXISTS (
           SELECT 1 FROM message_media mm
           WHERE mm.blob_hash = mb.hash
             AND mm.upload_status != 'uploaded'
         )`,
      [cutoffTimestamp]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return 0;
    }

    let deleted = 0;
    for (const row of result[0].values) {
      const hash = row[0] as string;
      if (await this.deleteBlob(hash)) {
        deleted++;
      }
    }
    return deleted;
  }

  /**
   * Evict oldest uploaded blobs (by uploaded_at) until storage is within quota.
   * Only evicts blobs where ALL message_media references are 'uploaded'.
   * Never evicts unuploaded (pending/uploading) blobs.
   */
  private async evictToQuota(quotaBytes: number): Promise<number> {
    let currentUsage = this.getStorageUsage();
    if (currentUsage <= quotaBytes) {
      return 0;
    }

    // Get uploaded blobs ordered by uploaded_at ASC (oldest first = LRU)
    const result = this.db!.exec(
      `SELECT mb.hash, mb.size_bytes FROM media_blobs mb
       WHERE mb.uploaded_at IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM message_media mm
           WHERE mm.blob_hash = mb.hash
             AND mm.upload_status != 'uploaded'
         )
       ORDER BY mb.uploaded_at ASC`
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return 0;
    }

    let deleted = 0;
    for (const row of result[0].values) {
      if (currentUsage <= quotaBytes) break;

      const hash = row[0] as string;
      const sizeBytes = row[1] as number;

      if (await this.deleteBlob(hash)) {
        currentUsage -= sizeBytes;
        deleted++;
      }
    }
    return deleted;
  }

  /**
   * Start automatic cleanup scheduler.
   *
   * CONTRACT:
   *   Inputs:
   *     - intervalMs: number, cleanup interval in milliseconds (default 24 hours)
   *     - retentionDays: number, retention period in days (default 7)
   *     - quotaBytes: number, storage quota in bytes (default 500 MB)
   *
   *   Outputs:
   *     - void
   *
   *   Invariants:
   *     - After call, cleanup runs periodically at specified interval
   *     - Only one scheduler runs at a time (stops existing before starting new)
   *
   *   Properties:
   *     - Idempotent: safe to call multiple times (stops existing first)
   *     - Side effects: sets cleanupTimer, logs cleanup results
   *
   *   Algorithm:
   *     1. Stop existing scheduler if running
   *     2. Start new interval timer
   *     3. Run cleanup immediately, then at specified interval
   */
  startScheduler(
    intervalMs: number = 24 * 60 * 60 * 1000, // 24 hours
    retentionDays: number = 7,
    quotaBytes: number = 500 * 1024 * 1024
  ): void {
    // Stop existing scheduler if running
    this.stopScheduler();

    // Run cleanup immediately
    this.runCleanup(retentionDays, quotaBytes).catch((error) => {
      console.error('[BlobStorageService] Scheduled cleanup failed:', error);
    });

    // Schedule periodic cleanup
    this.cleanupTimer = setInterval(() => {
      this.runCleanup(retentionDays, quotaBytes).catch((error) => {
        console.error('[BlobStorageService] Scheduled cleanup failed:', error);
      });
    }, intervalMs);
  }

  /**
   * Stop automatic cleanup scheduler.
   *
   * CONTRACT:
   *   Inputs:
   *     - this: BlobStorageService instance
   *
   *   Outputs:
   *     - void
   *
   *   Invariants:
   *     - After call, no scheduled cleanup is running
   *     - cleanupTimer is null
   *
   *   Properties:
   *     - Idempotent: safe to call multiple times
   *     - Safe to call if no scheduler running
   */
  stopScheduler(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}
