/**
 * Tests for Upload Pipeline Service
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import http from 'http';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { UploadPipelineService, UploadDependencies, UploadProgress } from './upload-pipeline';
import { runMigrations } from '../database/migrations';

jest.mock('electron', () => ({
  app: { getPath: jest.fn().mockReturnValue('/tmp') },
  safeStorage: { isEncryptionAvailable: jest.fn().mockReturnValue(false) },
}));

jest.mock('../logging', () => ({
  log: jest.fn(),
  setLogLevel: jest.fn(),
}));

jest.mock('../blossom/Nip98AuthService', () => ({
  generateNip98Token: jest.fn(() => ({
    authorizationHeader: 'Nostr dGVzdC10b2tlbg==',
    event: { kind: 27235, tags: [] },
  })),
}));

let SQL: SqlJsStatic;
let database: Database;
let tempDir: string;
let blobsDir: string;

// Mock Blossom HTTP server
let server: http.Server;
let serverPort: number;
let serverBehavior: 'success' | 'reject-413' | 'reject-415' | 'error-500' | 'timeout';
let requestLog: Array<{ method: string; url: string; headers: Record<string, string | string[] | undefined> }>;

function startMockServer(): Promise<void> {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      requestLog.push({
        method: req.method || '',
        url: req.url || '',
        headers: req.headers,
      });

      // Consume body
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        switch (serverBehavior) {
          case 'success':
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ url: `https://blossom.example.com/blobs/${Date.now()}` }));
            break;
          case 'reject-413':
            res.writeHead(413, { 'Content-Type': 'text/plain' });
            res.end('File too large');
            break;
          case 'reject-415':
            res.writeHead(415, { 'Content-Type': 'text/plain' });
            res.end('Unsupported media type');
            break;
          case 'error-500':
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal server error');
            break;
          case 'timeout':
            // Don't respond (will timeout)
            break;
        }
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      serverPort = typeof addr === 'object' && addr ? addr.port : 0;
      resolve();
    });
  });
}

function stopMockServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.closeAllConnections();
      server.close(() => resolve());
    } else {
      resolve();
    }
  });
}

function createTestBlob(hash: string, content: string): void {
  const blobPath = join(blobsDir, hash);
  writeFileSync(blobPath, content);

  // Insert into media_blobs table
  database.run(
    'INSERT OR IGNORE INTO media_blobs (hash, mime_type, size_bytes, local_path, created_at) VALUES (?, ?, ?, ?, ?)',
    [hash, 'image/jpeg', Buffer.byteLength(content), blobPath, Date.now()]
  );
}

function createTestMessage(messageId: string, identityId: string, contactId: string): void {
  database.run(
    `INSERT INTO nostr_messages (id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, timestamp, status, direction, is_read, kind, was_gift_wrapped, media_json)
     VALUES (?, ?, ?, 'npub1', 'npub2', 'test', datetime('now'), 'queued', 'outgoing', 1, 14, 1, ?)`,
    [
      messageId,
      identityId,
      contactId,
      JSON.stringify({
        attachments: [
          { hash: 'hash1', name: 'file1.jpg', mimeType: 'image/jpeg', sizeBytes: 100, imeta: ['imeta', 'url local-blob:hash1', 'm image/jpeg', 'size 100', 'sha256 hash1'] },
        ],
      }),
    ]
  );
}

function createTestMessageMedia(messageId: string, blobHash: string, status = 'pending'): void {
  database.run(
    'INSERT INTO message_media (message_id, blob_hash, placeholder_key, upload_status) VALUES (?, ?, ?, ?)',
    [messageId, blobHash, `local-blob:${blobHash}`, status]
  );
}

function makeDeps(overrides: Partial<UploadDependencies> = {}): UploadDependencies {
  return {
    database,
    getSecretKey: jest.fn(async () => new Uint8Array(32)) as UploadDependencies['getSecretKey'],
    selectHealthyServer: jest.fn(async () => ({ url: `http://127.0.0.1:${serverPort}` })) as UploadDependencies['selectHealthyServer'],
    getIdentityPubkey: jest.fn(() => 'pubkey123') as UploadDependencies['getIdentityPubkey'],
    ...overrides,
  };
}

beforeAll(async () => {
  SQL = await initSqlJs();
});

beforeEach(async () => {
  database = new SQL.Database();
  await runMigrations(database);
  tempDir = join(tmpdir(), `upload-test-${Date.now()}`);
  blobsDir = join(tempDir, 'blobs');
  mkdirSync(blobsDir, { recursive: true });
  serverBehavior = 'success';
  requestLog = [];

  // Create test identity and contact
  database.run(
    "INSERT INTO nostr_identities (id, label, npub, secret_ref, created_at) VALUES ('id1', 'Test', 'npub1', 'ref1', datetime('now'))"
  );
  database.run(
    "INSERT INTO nostr_contacts (id, identity_id, npub, alias, state, created_at) VALUES ('c1', 'id1', 'npub2', 'TestContact', 'connected', datetime('now'))"
  );

  await startMockServer();
});

afterEach(async () => {
  await stopMockServer();
  database.close();
  try { rmSync(tempDir, { recursive: true }); } catch { /* ignore */ }
});

describe('UploadPipelineService', () => {
  describe('processPendingUploads', () => {
    it('should upload pending blobs and return completed message IDs', async () => {
      createTestBlob('hash1', 'blob-content-1');
      createTestMessage('msg1', 'id1', 'c1');
      createTestMessageMedia('msg1', 'hash1');

      const pipeline = new UploadPipelineService(makeDeps());
      const completed = await pipeline.processPendingUploads();

      expect(completed).toContain('msg1');

      // Verify upload status updated
      const stmt = database.prepare('SELECT upload_status, remote_url FROM message_media WHERE message_id = ?');
      stmt.bind(['msg1']);
      stmt.step();
      const row = stmt.getAsObject() as { upload_status: string; remote_url: string };
      stmt.free();

      expect(row.upload_status).toBe('uploaded');
      expect(row.remote_url).toMatch(/^https:\/\/blossom\.example\.com\/blobs\//);
    });

    it('should return empty array when no pending uploads', async () => {
      const pipeline = new UploadPipelineService(makeDeps());
      const completed = await pipeline.processPendingUploads();
      expect(completed).toEqual([]);
    });

    it('should send NIP-98 Authorization header with upload', async () => {
      createTestBlob('hash1', 'blob-content');
      createTestMessage('msg1', 'id1', 'c1');
      createTestMessageMedia('msg1', 'hash1');

      const pipeline = new UploadPipelineService(makeDeps());
      await pipeline.processPendingUploads();

      expect(requestLog.length).toBeGreaterThanOrEqual(1);
      const putRequest = requestLog.find((r) => r.method === 'PUT');
      expect(putRequest).toBeDefined();
      expect(putRequest!.headers.authorization).toBe('Nostr dGVzdC10b2tlbg==');
    });

    it('should filter by identity when identityId provided', async () => {
      createTestBlob('hash1', 'content1');
      createTestMessage('msg1', 'id1', 'c1');
      createTestMessageMedia('msg1', 'hash1');

      const pipeline = new UploadPipelineService(makeDeps());
      const completed = await pipeline.processPendingUploads('id1');
      expect(completed).toContain('msg1');
    });
  });

  describe('placeholder replacement', () => {
    it('should replace local-blob placeholders with remote URLs in media_json', async () => {
      createTestBlob('hash1', 'blob-content');
      createTestMessage('msg1', 'id1', 'c1');
      createTestMessageMedia('msg1', 'hash1');

      const pipeline = new UploadPipelineService(makeDeps());
      await pipeline.processPendingUploads();

      // Verify media_json updated
      const stmt = database.prepare('SELECT media_json FROM nostr_messages WHERE id = ?');
      stmt.bind(['msg1']);
      stmt.step();
      const mediaJson = stmt.getAsObject().media_json as string;
      stmt.free();

      expect(mediaJson).not.toContain('local-blob:');
      expect(mediaJson).toContain('blossom.example.com');
    });
  });

  describe('retry logic', () => {
    it('should retry on server error with exponential backoff', async () => {
      createTestBlob('hash1', 'blob-content');
      createTestMessage('msg1', 'id1', 'c1');
      createTestMessageMedia('msg1', 'hash1');

      // First 2 attempts fail, then succeed
      let attemptCount = 0;
      const origBehavior = serverBehavior;
      server.removeAllListeners('request');
      server.on('request', (req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          attemptCount++;
          if (attemptCount <= 2) {
            res.writeHead(500);
            res.end('Server error');
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ url: 'https://blossom.example.com/blobs/success' }));
          }
        });
      });

      const pipeline = new UploadPipelineService(makeDeps());
      const result = await pipeline.uploadBlobWithRetry({
        messageId: 'msg1',
        blobHash: 'hash1',
        localPath: join(blobsDir, 'hash1'),
        sizeBytes: 12,
        mimeType: 'image/jpeg',
        identityId: 'id1',
      });

      expect(result.success).toBe(true);
      expect(attemptCount).toBe(3);
    }, 15000);

    it('should not retry on 413 rejection', async () => {
      createTestBlob('hash1', 'blob-content');
      createTestMessage('msg1', 'id1', 'c1');
      createTestMessageMedia('msg1', 'hash1');
      serverBehavior = 'reject-413';

      const pipeline = new UploadPipelineService(makeDeps());
      const result = await pipeline.uploadBlobWithRetry({
        messageId: 'msg1',
        blobHash: 'hash1',
        localPath: join(blobsDir, 'hash1'),
        sizeBytes: 12,
        mimeType: 'image/jpeg',
        identityId: 'id1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('413');
      // Should only have 1 attempt (no retry for 413)
      expect(requestLog.length).toBe(1);
    });

    it('should not retry on 415 rejection', async () => {
      createTestBlob('hash1', 'blob-content');
      createTestMessage('msg1', 'id1', 'c1');
      createTestMessageMedia('msg1', 'hash1');
      serverBehavior = 'reject-415';

      const pipeline = new UploadPipelineService(makeDeps());
      const result = await pipeline.uploadBlobWithRetry({
        messageId: 'msg1',
        blobHash: 'hash1',
        localPath: join(blobsDir, 'hash1'),
        sizeBytes: 12,
        mimeType: 'image/jpeg',
        identityId: 'id1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('415');
      expect(requestLog.length).toBe(1);
    });
  });

  describe('partial failure handling', () => {
    it('should not mark message complete when any upload fails', async () => {
      createTestBlob('hash1', 'content1');
      createTestBlob('hash2', 'content2');

      // Create message with 2 attachments
      database.run(
        `INSERT INTO nostr_messages (id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, timestamp, status, direction, is_read, kind, was_gift_wrapped, media_json)
         VALUES ('msg2', 'id1', 'c1', 'npub1', 'npub2', 'test', datetime('now'), 'queued', 'outgoing', 1, 14, 1, ?)`,
        [JSON.stringify({ attachments: [{ hash: 'hash1', imeta: ['imeta', 'url local-blob:hash1'] }, { hash: 'hash2', imeta: ['imeta', 'url local-blob:hash2'] }] })]
      );
      createTestMessageMedia('msg2', 'hash1');
      createTestMessageMedia('msg2', 'hash2');

      // First upload succeeds, second fails
      let uploadCount = 0;
      server.removeAllListeners('request');
      server.on('request', (req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          uploadCount++;
          if (uploadCount === 1) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ url: 'https://blossom.example.com/blob1' }));
          } else {
            res.writeHead(413);
            res.end('Too large');
          }
        });
      });

      const pipeline = new UploadPipelineService(makeDeps());
      const completed = await pipeline.processPendingUploads();

      // Message should NOT be in completed list
      expect(completed).not.toContain('msg2');

      // Verify per-attachment status
      const stmt = database.prepare('SELECT blob_hash, upload_status FROM message_media WHERE message_id = ? ORDER BY blob_hash');
      stmt.bind(['msg2']);
      const statuses: Array<{ blob_hash: string; upload_status: string }> = [];
      while (stmt.step()) {
        statuses.push(stmt.getAsObject() as { blob_hash: string; upload_status: string });
      }
      stmt.free();

      expect(statuses).toEqual([
        { blob_hash: 'hash1', upload_status: 'uploaded' },
        { blob_hash: 'hash2', upload_status: 'failed' },
      ]);
    });
  });

  describe('retryFailedUploads', () => {
    it('should retry only failed attachments', async () => {
      createTestBlob('hash1', 'content1');
      createTestBlob('hash2', 'content2');

      database.run(
        `INSERT INTO nostr_messages (id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, timestamp, status, direction, is_read, kind, was_gift_wrapped, media_json)
         VALUES ('msg3', 'id1', 'c1', 'npub1', 'npub2', 'test', datetime('now'), 'queued', 'outgoing', 1, 14, 1, ?)`,
        [JSON.stringify({ attachments: [{ hash: 'hash1', imeta: ['imeta', 'url local-blob:hash1'] }, { hash: 'hash2', imeta: ['imeta', 'url local-blob:hash2'] }] })]
      );

      // hash1 already uploaded, hash2 failed
      createTestMessageMedia('msg3', 'hash1', 'uploaded');
      database.run(
        "UPDATE message_media SET remote_url = 'https://example.com/hash1' WHERE message_id = 'msg3' AND blob_hash = 'hash1'"
      );
      createTestMessageMedia('msg3', 'hash2', 'failed');

      const pipeline = new UploadPipelineService(makeDeps());
      const success = await pipeline.retryFailedUploads('msg3');

      expect(success).toBe(true);

      // Verify only hash2 was uploaded (1 request, not 2)
      const putRequests = requestLog.filter((r) => r.method === 'PUT');
      expect(putRequests).toHaveLength(1);
    });
  });

  describe('no healthy server', () => {
    it('should fail when no healthy server available', async () => {
      createTestBlob('hash1', 'content');
      createTestMessage('msg1', 'id1', 'c1');
      createTestMessageMedia('msg1', 'hash1');

      const deps = makeDeps({
        selectHealthyServer: jest.fn(async () => null) as UploadDependencies['selectHealthyServer'],
      });

      const pipeline = new UploadPipelineService(deps);
      const completed = await pipeline.processPendingUploads();

      expect(completed).not.toContain('msg1');
    }, 30000);
  });

  describe('hasAllUploadsCompleted', () => {
    it('should return true when all uploads are complete', () => {
      createTestMessage('msg1', 'id1', 'c1');
      createTestMessageMedia('msg1', 'hash1', 'uploaded');

      const pipeline = new UploadPipelineService(makeDeps());
      expect(pipeline.hasAllUploadsCompleted('msg1')).toBe(true);
    });

    it('should return false when uploads are still pending', () => {
      createTestMessage('msg1', 'id1', 'c1');
      createTestMessageMedia('msg1', 'hash1', 'pending');

      const pipeline = new UploadPipelineService(makeDeps());
      expect(pipeline.hasAllUploadsCompleted('msg1')).toBe(false);
    });
  });

  describe('hasMediaAttachments', () => {
    it('should return true when message has media', () => {
      createTestMessage('msg1', 'id1', 'c1');
      createTestMessageMedia('msg1', 'hash1');

      const pipeline = new UploadPipelineService(makeDeps());
      expect(pipeline.hasMediaAttachments('msg1')).toBe(true);
    });

    it('should return false when message has no media', () => {
      createTestMessage('msg1', 'id1', 'c1');

      const pipeline = new UploadPipelineService(makeDeps());
      expect(pipeline.hasMediaAttachments('msg1')).toBe(false);
    });
  });

  describe('concurrency limiting', () => {
    it('should enforce MAX_CONCURRENT_PER_IDENTITY=2 limit', async () => {
      // Create 4 uploads for the same identity
      for (let i = 1; i <= 4; i++) {
        createTestBlob(`hash${i}`, `content${i}`);
        database.run(
          `INSERT INTO nostr_messages (id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, timestamp, status, direction, is_read, kind, was_gift_wrapped, media_json)
           VALUES ('msg${i}', 'id1', 'c1', 'npub1', 'npub2', 'test', datetime('now'), 'queued', 'outgoing', 1, 14, 1, ?)`,
          [JSON.stringify({ attachments: [{ hash: `hash${i}`, imeta: ['imeta', `url local-blob:hash${i}`] }] })]
        );
        createTestMessageMedia(`msg${i}`, `hash${i}`);
      }

      // Track concurrent requests on the server
      let maxConcurrent = 0;
      let currentConcurrent = 0;
      server.removeAllListeners('request');
      server.on('request', (req, res) => {
        currentConcurrent++;
        if (currentConcurrent > maxConcurrent) maxConcurrent = currentConcurrent;

        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          // Add a small delay to keep the request open and allow concurrency measurement
          setTimeout(() => {
            currentConcurrent--;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ url: `https://blossom.example.com/blobs/hash` }));
          }, 50);
        });
      });

      const pipeline = new UploadPipelineService(makeDeps());
      await pipeline.processPendingUploads();

      // The pipeline processes uploads sequentially per identity (for loop with concurrency slots),
      // so max concurrent should not exceed 2
      expect(maxConcurrent).toBeLessThanOrEqual(2);
      // All 4 uploads should have completed
      const stmt = database.prepare("SELECT COUNT(*) as cnt FROM message_media WHERE upload_status = 'uploaded'");
      stmt.step();
      const count = (stmt.getAsObject() as { cnt: number }).cnt;
      stmt.free();
      expect(count).toBe(4);
    }, 15000);
  });

  describe('crash recovery', () => {
    it('should pick up uploads with uploading status after restart', async () => {
      createTestBlob('hash1', 'blob-content');
      createTestMessage('msg1', 'id1', 'c1');
      // Simulate a crash: upload was in-progress when app died
      createTestMessageMedia('msg1', 'hash1', 'uploading');

      const pipeline = new UploadPipelineService(makeDeps());
      const completed = await pipeline.processPendingUploads();

      expect(completed).toContain('msg1');

      const stmt = database.prepare('SELECT upload_status FROM message_media WHERE message_id = ?');
      stmt.bind(['msg1']);
      stmt.step();
      const row = stmt.getAsObject() as { upload_status: string };
      stmt.free();
      expect(row.upload_status).toBe('uploaded');
    });
  });

  describe('cancellation', () => {
    it('should cancel upload and revert to pending', async () => {
      createTestBlob('hash1', 'blob-content');
      createTestMessage('msg1', 'id1', 'c1');
      createTestMessageMedia('msg1', 'hash1');

      const pipeline = new UploadPipelineService(makeDeps());
      pipeline.cancelUpload('msg1', 'hash1');

      const completed = await pipeline.processPendingUploads();
      expect(completed).not.toContain('msg1');
    });

    it('should revert upload_status to pending in database when cancelled', async () => {
      createTestBlob('hash1', 'blob-content');
      createTestMessage('msg1', 'id1', 'c1');
      createTestMessageMedia('msg1', 'hash1');

      const pipeline = new UploadPipelineService(makeDeps());
      pipeline.cancelUpload('msg1', 'hash1');

      await pipeline.processPendingUploads();

      // Verify DB status is reverted to 'pending' (not left in limbo)
      const stmt = database.prepare('SELECT upload_status FROM message_media WHERE message_id = ? AND blob_hash = ?');
      stmt.bind(['msg1', 'hash1']);
      stmt.step();
      const row = stmt.getAsObject() as { upload_status: string };
      stmt.free();
      expect(row.upload_status).toBe('pending');
    });
  });

  describe('progress reporting', () => {
    it('should report upload progress via callback', async () => {
      createTestBlob('hash1', 'blob-content');
      createTestMessage('msg1', 'id1', 'c1');
      createTestMessageMedia('msg1', 'hash1');

      const progressUpdates: UploadProgress[] = [];
      const deps = makeDeps({
        onProgress: (p) => progressUpdates.push({ ...p }),
      });

      const pipeline = new UploadPipelineService(deps);
      await pipeline.processPendingUploads();

      expect(progressUpdates.length).toBeGreaterThanOrEqual(2);
      expect(progressUpdates[0].status).toBe('uploading');
      expect(progressUpdates[progressUpdates.length - 1].status).toBe('uploaded');
    });

    it('should report failed status when upload fails', async () => {
      createTestBlob('hash1', 'blob-content');
      createTestMessage('msg1', 'id1', 'c1');
      createTestMessageMedia('msg1', 'hash1');
      serverBehavior = 'reject-413';

      const progressUpdates: UploadProgress[] = [];
      const deps = makeDeps({
        onProgress: (p) => progressUpdates.push({ ...p }),
      });

      const pipeline = new UploadPipelineService(deps);
      await pipeline.processPendingUploads();

      const failedUpdate = progressUpdates.find((p) => p.status === 'failed');
      expect(failedUpdate).toBeDefined();
      expect(failedUpdate!.messageId).toBe('msg1');
      expect(failedUpdate!.blobHash).toBe('hash1');
    });
  });
});
