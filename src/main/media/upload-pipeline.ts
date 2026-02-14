/**
 * Upload Pipeline Service
 *
 * Handles blob upload to Blossom servers using BUD-06 HTTP PUT with NIP-98 authentication.
 * Manages retry logic, concurrency limiting, placeholder replacement, and progress reporting.
 */

import { Database } from 'sql.js';
import { readFile } from 'fs/promises';
import { createHash } from 'crypto';
import http from 'http';
import https from 'https';
import { log } from '../logging';
import { generateNip98Token } from '../blossom/Nip98AuthService';

export interface UploadDependencies {
  database: Database;
  getSecretKey: (identityId: string) => Promise<Uint8Array>;
  selectHealthyServer: (identityPubkey: string) => Promise<{ url: string } | null>;
  getIdentityPubkey: (identityId: string) => string;
  onProgress?: (progress: UploadProgress) => void;
}

export interface UploadProgress {
  messageId: string;
  blobHash: string;
  status: 'uploading' | 'uploaded' | 'failed';
  bytesUploaded: number;
  totalBytes: number;
  error?: string;
}

interface PendingUpload {
  messageId: string;
  blobHash: string;
  localPath: string;
  sizeBytes: number;
  mimeType: string;
  identityId: string;
}

const MAX_RETRIES = 5;
const BACKOFF_DELAYS = [1000, 2000, 4000, 8000, 30000]; // ms
const MAX_CONCURRENT_PER_IDENTITY = 2;

/**
 * Upload pipeline service for Blossom BUD-06 blob uploads.
 *
 * CONTRACT:
 *   - Uploads pending blobs to healthy Blossom servers with NIP-98 auth
 *   - Replaces local-blob placeholders with remote URLs in media_json
 *   - Retries with exponential backoff (1s, 2s, 4s, 8s, 30s max, 5 attempts)
 *   - Limits concurrency to 2 uploads per identity
 *   - Reports progress via callback
 *   - Never publishes messages with unresolved placeholders
 */
export class UploadPipelineService {
  private deps: UploadDependencies;
  private activeUploads = new Map<string, number>(); // identityId → count
  private cancelledUploads = new Set<string>(); // "messageId:blobHash"

  constructor(deps: UploadDependencies) {
    this.deps = deps;
  }

  /**
   * Process all pending uploads for messages in the outgoing queue.
   * Returns the list of message IDs that have all uploads completed.
   */
  async processPendingUploads(identityId?: string): Promise<string[]> {
    const pending = this.getPendingUploads(identityId);
    if (pending.length === 0) return [];

    // Group by message
    const byMessage = new Map<string, PendingUpload[]>();
    for (const upload of pending) {
      const existing = byMessage.get(upload.messageId) || [];
      existing.push(upload);
      byMessage.set(upload.messageId, existing);
    }

    const completedMessages: string[] = [];

    for (const [messageId, uploads] of byMessage) {
      const identity = uploads[0].identityId;

      // Upload each blob with concurrency control
      const results = await this.uploadBlobsWithConcurrency(identity, uploads);

      // Check if all succeeded
      const allSucceeded = results.every((r) => r.success);
      if (allSucceeded) {
        // Replace placeholders in media_json
        this.replacePlaceholdersInMediaJson(messageId);
        completedMessages.push(messageId);
      }
    }

    return completedMessages;
  }

  /**
   * Upload blobs with per-identity concurrency limiting.
   */
  private async uploadBlobsWithConcurrency(
    identityId: string,
    uploads: PendingUpload[]
  ): Promise<Array<{ blobHash: string; success: boolean; remoteUrl?: string }>> {
    const results: Array<{ blobHash: string; success: boolean; remoteUrl?: string }> = [];

    // Process sequentially with concurrency check
    for (const upload of uploads) {
      // Wait for concurrency slot
      while ((this.activeUploads.get(identityId) || 0) >= MAX_CONCURRENT_PER_IDENTITY) {
        await sleep(100);
      }

      // Check cancellation - revert status to pending so it can be retried later
      const cancelKey = `${upload.messageId}:${upload.blobHash}`;
      if (this.cancelledUploads.has(cancelKey)) {
        this.cancelledUploads.delete(cancelKey);
        this.updateUploadStatus(upload.messageId, upload.blobHash, 'pending');
        results.push({ blobHash: upload.blobHash, success: false });
        continue;
      }

      // Increment active count
      this.activeUploads.set(identityId, (this.activeUploads.get(identityId) || 0) + 1);

      try {
        const result = await this.uploadBlobWithRetry(upload);
        results.push(result);
      } finally {
        // Decrement active count
        const current = this.activeUploads.get(identityId) || 1;
        this.activeUploads.set(identityId, Math.max(0, current - 1));
      }
    }

    return results;
  }

  /**
   * Upload a single blob with exponential backoff retry.
   */
  async uploadBlobWithRetry(
    upload: PendingUpload
  ): Promise<{ blobHash: string; success: boolean; remoteUrl?: string; error?: string }> {
    // Mark as uploading
    this.updateUploadStatus(upload.messageId, upload.blobHash, 'uploading');
    this.deps.onProgress?.({
      messageId: upload.messageId,
      blobHash: upload.blobHash,
      status: 'uploading',
      bytesUploaded: 0,
      totalBytes: upload.sizeBytes,
    });

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // Check cancellation
      const cancelKey = `${upload.messageId}:${upload.blobHash}`;
      if (this.cancelledUploads.has(cancelKey)) {
        this.updateUploadStatus(upload.messageId, upload.blobHash, 'pending');
        return { blobHash: upload.blobHash, success: false, error: 'Cancelled' };
      }

      try {
        const remoteUrl = await this.uploadBlob(upload);

        // Success - update database
        this.updateUploadSuccess(upload.messageId, upload.blobHash, remoteUrl);
        this.deps.onProgress?.({
          messageId: upload.messageId,
          blobHash: upload.blobHash,
          status: 'uploaded',
          bytesUploaded: upload.sizeBytes,
          totalBytes: upload.sizeBytes,
        });

        return { blobHash: upload.blobHash, success: true, remoteUrl };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log('warn', `Upload attempt ${attempt + 1}/${MAX_RETRIES} failed for ${upload.blobHash}: ${errorMessage}`);

        // Check for non-retryable errors (413, 415)
        if (errorMessage.includes('413') || errorMessage.includes('415')) {
          this.updateUploadStatus(upload.messageId, upload.blobHash, 'failed');
          this.deps.onProgress?.({
            messageId: upload.messageId,
            blobHash: upload.blobHash,
            status: 'failed',
            bytesUploaded: 0,
            totalBytes: upload.sizeBytes,
            error: errorMessage,
          });
          return { blobHash: upload.blobHash, success: false, error: errorMessage };
        }

        // Retryable: wait with exponential backoff
        if (attempt < MAX_RETRIES - 1) {
          await sleep(BACKOFF_DELAYS[attempt]);
        }
      }
    }

    // All retries exhausted
    this.updateUploadStatus(upload.messageId, upload.blobHash, 'failed');
    this.deps.onProgress?.({
      messageId: upload.messageId,
      blobHash: upload.blobHash,
      status: 'failed',
      bytesUploaded: 0,
      totalBytes: upload.sizeBytes,
      error: 'Max retries exceeded',
    });

    return { blobHash: upload.blobHash, success: false, error: 'Max retries exceeded' };
  }

  /**
   * Perform a single upload attempt to Blossom server.
   */
  private async uploadBlob(upload: PendingUpload): Promise<string> {
    const identityPubkey = this.deps.getIdentityPubkey(upload.identityId);

    // Select healthy server
    const server = await this.deps.selectHealthyServer(identityPubkey);
    if (!server) {
      throw new Error('No healthy Blossom server available');
    }

    // Read blob file
    const blobData = await readFile(upload.localPath);

    // Compute body hash for NIP-98
    const bodyHash = createHash('sha256').update(blobData).digest('hex');

    // Generate NIP-98 auth token
    const secretKey = await this.deps.getSecretKey(upload.identityId);
    const uploadUrl = `${server.url}/upload`;
    const { authorizationHeader } = generateNip98Token(secretKey, uploadUrl, 'PUT', bodyHash);

    // HTTP PUT to Blossom server (BUD-06)
    // Uses Node.js http/https modules for reliable DNS resolution in Electron
    // (Electron's fetch uses Chromium's network stack with separate DNS resolver)
    const transport = uploadUrl.startsWith('https://') ? https : http;

    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        req.destroy();
        reject(new Error('Upload timed out after 30 seconds'));
      }, 30000);

      const req = transport.request(
        uploadUrl,
        {
          method: 'PUT',
          headers: {
            'Authorization': authorizationHeader,
            'Content-Type': upload.mimeType,
            'Content-Length': String(blobData.length),
          },
          timeout: 30000,
        },
        (res) => {
          clearTimeout(timeout);
          const chunks: Buffer[] = [];

          res.on('data', (chunk: Buffer) => chunks.push(chunk));

          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));

                // BUG FIX: Construct URL from client-configured server URL instead of trusting server-provided hostname
                // Root cause: Server returns its own hostname (e.g., Docker internal name) which may be unreachable from client
                // Bug report: bug-reports/blossom-url-docker-hostname-report.md
                // Fixed: 2026-02-14

                // Extract blob hash from response (prefer sha256 field, fallback to parsing URL)
                let hash = body.sha256;
                if (!hash) {
                  const serverUrl = body.url || body.nurl;
                  if (!serverUrl) {
                    reject(new Error('Server response missing URL and sha256'));
                    return;
                  }
                  // Extract hash from URL path: try /blob(s)/<hash> pattern first, then last path segment
                  let match = serverUrl.match(/\/blobs?\/([^/?]+)/);
                  if (!match) {
                    // Fallback: extract last path segment (e.g., /blob1 -> blob1)
                    match = serverUrl.match(/\/([^/?]+)(?:[?#].*)?$/);
                  }
                  hash = match ? match[1] : null;
                }

                if (!hash) {
                  reject(new Error('Could not extract blob hash from server response'));
                } else {
                  // Construct URL using client-configured server base URL
                  const remoteUrl = `${server.url}/blob/${hash}`;
                  resolve(remoteUrl);
                }
              } catch {
                reject(new Error('Failed to parse upload response'));
              }
            } else {
              const statusText = res.statusMessage || 'Upload failed';
              reject(new Error(`${res.statusCode}: ${statusText}`));
            }
          });
        }
      );

      req.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        clearTimeout(timeout);
        reject(new Error('Upload timed out after 30 seconds'));
      });

      req.write(blobData);
      req.end();
    });
  }

  /**
   * Cancel an in-progress upload. It will revert to 'pending' status.
   */
  cancelUpload(messageId: string, blobHash: string): void {
    this.cancelledUploads.add(`${messageId}:${blobHash}`);
  }

  /**
   * Retry only failed uploads for a specific message.
   */
  async retryFailedUploads(messageId: string): Promise<boolean> {
    const failed = this.getFailedUploads(messageId);
    if (failed.length === 0) return true;

    // Reset failed to pending
    for (const upload of failed) {
      this.updateUploadStatus(upload.messageId, upload.blobHash, 'pending');
      this.cancelledUploads.delete(`${upload.messageId}:${upload.blobHash}`);
    }

    const identityId = failed[0].identityId;
    const results = await this.uploadBlobsWithConcurrency(identityId, failed);

    const allSucceeded = results.every((r) => r.success);
    if (allSucceeded) {
      this.replacePlaceholdersInMediaJson(messageId);
    }

    return allSucceeded;
  }

  /**
   * Check if a message has all uploads completed.
   */
  hasAllUploadsCompleted(messageId: string): boolean {
    const stmt = this.deps.database.prepare(
      'SELECT COUNT(*) as count FROM message_media WHERE message_id = ? AND upload_status != ?'
    );
    stmt.bind([messageId, 'uploaded']);
    stmt.step();
    const count = (stmt.getAsObject() as { count: number }).count;
    stmt.free();
    return count === 0;
  }

  /**
   * Check if a message has any pending or uploading media.
   */
  hasMediaAttachments(messageId: string): boolean {
    const stmt = this.deps.database.prepare(
      'SELECT COUNT(*) as count FROM message_media WHERE message_id = ?'
    );
    stmt.bind([messageId]);
    stmt.step();
    const count = (stmt.getAsObject() as { count: number }).count;
    stmt.free();
    return count > 0;
  }

  // --- Private helpers ---

  private getPendingUploads(identityId?: string): PendingUpload[] {
    const query = identityId
      ? `SELECT mm.message_id, mm.blob_hash, mb.local_path, mb.size_bytes, mb.mime_type, nm.identity_id
         FROM message_media mm
         JOIN media_blobs mb ON mm.blob_hash = mb.hash
         JOIN nostr_messages nm ON mm.message_id = nm.id
         WHERE mm.upload_status IN ('pending', 'uploading') AND nm.identity_id = ?
         ORDER BY nm.timestamp ASC`
      : `SELECT mm.message_id, mm.blob_hash, mb.local_path, mb.size_bytes, mb.mime_type, nm.identity_id
         FROM message_media mm
         JOIN media_blobs mb ON mm.blob_hash = mb.hash
         JOIN nostr_messages nm ON mm.message_id = nm.id
         WHERE mm.upload_status IN ('pending', 'uploading')
         ORDER BY nm.timestamp ASC`;

    const stmt = this.deps.database.prepare(query);
    if (identityId) stmt.bind([identityId]);

    const results: PendingUpload[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as {
        message_id: string;
        blob_hash: string;
        local_path: string;
        size_bytes: number;
        mime_type: string;
        identity_id: string;
      };
      results.push({
        messageId: row.message_id,
        blobHash: row.blob_hash,
        localPath: row.local_path,
        sizeBytes: row.size_bytes,
        mimeType: row.mime_type,
        identityId: row.identity_id,
      });
    }
    stmt.free();
    return results;
  }

  private getFailedUploads(messageId: string): PendingUpload[] {
    const stmt = this.deps.database.prepare(
      `SELECT mm.message_id, mm.blob_hash, mb.local_path, mb.size_bytes, mb.mime_type, nm.identity_id
       FROM message_media mm
       JOIN media_blobs mb ON mm.blob_hash = mb.hash
       JOIN nostr_messages nm ON mm.message_id = nm.id
       WHERE mm.upload_status = 'failed' AND mm.message_id = ?`
    );
    stmt.bind([messageId]);

    const results: PendingUpload[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as {
        message_id: string;
        blob_hash: string;
        local_path: string;
        size_bytes: number;
        mime_type: string;
        identity_id: string;
      };
      results.push({
        messageId: row.message_id,
        blobHash: row.blob_hash,
        localPath: row.local_path,
        sizeBytes: row.size_bytes,
        mimeType: row.mime_type,
        identityId: row.identity_id,
      });
    }
    stmt.free();
    return results;
  }

  private updateUploadStatus(messageId: string, blobHash: string, status: string): void {
    this.deps.database.run(
      'UPDATE message_media SET upload_status = ? WHERE message_id = ? AND blob_hash = ?',
      [status, messageId, blobHash]
    );
  }

  private updateUploadSuccess(messageId: string, blobHash: string, remoteUrl: string): void {
    this.deps.database.run(
      'UPDATE message_media SET upload_status = ?, remote_url = ? WHERE message_id = ? AND blob_hash = ?',
      ['uploaded', remoteUrl, messageId, blobHash]
    );
  }

  /**
   * Replace local-blob:<hash> placeholders with actual remote URLs in media_json.
   */
  private replacePlaceholdersInMediaJson(messageId: string): void {
    // Get current media_json
    const msgStmt = this.deps.database.prepare('SELECT media_json FROM nostr_messages WHERE id = ?');
    msgStmt.bind([messageId]);
    if (!msgStmt.step()) {
      msgStmt.free();
      return;
    }
    const mediaJsonStr = msgStmt.getAsObject().media_json as string | null;
    msgStmt.free();

    if (!mediaJsonStr) return;

    // Get all remote URLs for this message
    const mediaStmt = this.deps.database.prepare(
      'SELECT blob_hash, remote_url FROM message_media WHERE message_id = ? AND upload_status = ?'
    );
    mediaStmt.bind([messageId, 'uploaded']);

    const urlMap = new Map<string, string>();
    while (mediaStmt.step()) {
      const row = mediaStmt.getAsObject() as { blob_hash: string; remote_url: string };
      urlMap.set(row.blob_hash, row.remote_url);
    }
    mediaStmt.free();

    // Replace placeholders in media_json
    let updatedJson = mediaJsonStr;
    for (const [hash, remoteUrl] of urlMap) {
      updatedJson = updatedJson.replace(`local-blob:${hash}`, remoteUrl);
    }

    // Update database
    this.deps.database.run(
      'UPDATE nostr_messages SET media_json = ? WHERE id = ?',
      [updatedJson, messageId]
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
