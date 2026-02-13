import { describe, expect, it } from '@jest/globals';
import type { UploadProgressEntry, MessageUploadProgress } from './useUploadProgress';

/**
 * Tests for upload progress calculation logic.
 *
 * Since useUploadProgress is a React hook, we test the core aggregation
 * logic that computes per-message progress from per-blob entries.
 */

function computeMessageProgress(blobs: UploadProgressEntry[]): MessageUploadProgress {
  const totalBytes = blobs.reduce((sum, b) => sum + b.totalBytes, 0);
  const uploadedBytes = blobs.reduce((sum, b) => sum + b.bytesUploaded, 0);
  return {
    progress: totalBytes > 0 ? uploadedBytes / totalBytes : 0,
    blobs,
    hasError: blobs.some(b => b.status === 'error'),
    isComplete: blobs.every(b => b.status === 'completed'),
  };
}

describe('Upload progress aggregation logic', () => {
  it('computes 0 progress for empty blobs', () => {
    const result = computeMessageProgress([]);
    expect(result.progress).toBe(0);
    expect(result.hasError).toBe(false);
    expect(result.isComplete).toBe(true); // every() on empty array is true
  });

  it('computes partial progress for single blob', () => {
    const result = computeMessageProgress([
      { messageId: 'msg1', blobHash: 'h1', status: 'uploading', bytesUploaded: 500, totalBytes: 1000 },
    ]);
    expect(result.progress).toBe(0.5);
    expect(result.hasError).toBe(false);
    expect(result.isComplete).toBe(false);
  });

  it('computes aggregate progress across multiple blobs', () => {
    const result = computeMessageProgress([
      { messageId: 'msg1', blobHash: 'h1', status: 'completed', bytesUploaded: 1000, totalBytes: 1000 },
      { messageId: 'msg1', blobHash: 'h2', status: 'uploading', bytesUploaded: 200, totalBytes: 1000 },
    ]);
    // 1200 / 2000 = 0.6
    expect(result.progress).toBe(0.6);
    expect(result.hasError).toBe(false);
    expect(result.isComplete).toBe(false);
  });

  it('detects error state when any blob has error', () => {
    const result = computeMessageProgress([
      { messageId: 'msg1', blobHash: 'h1', status: 'completed', bytesUploaded: 1000, totalBytes: 1000 },
      { messageId: 'msg1', blobHash: 'h2', status: 'error', bytesUploaded: 0, totalBytes: 1000, error: 'Server rejected' },
    ]);
    expect(result.hasError).toBe(true);
    expect(result.isComplete).toBe(false);
  });

  it('detects complete state when all blobs completed', () => {
    const result = computeMessageProgress([
      { messageId: 'msg1', blobHash: 'h1', status: 'completed', bytesUploaded: 1000, totalBytes: 1000 },
      { messageId: 'msg1', blobHash: 'h2', status: 'completed', bytesUploaded: 500, totalBytes: 500 },
    ]);
    expect(result.progress).toBe(1);
    expect(result.hasError).toBe(false);
    expect(result.isComplete).toBe(true);
  });

  it('handles zero totalBytes without division by zero', () => {
    const result = computeMessageProgress([
      { messageId: 'msg1', blobHash: 'h1', status: 'uploading', bytesUploaded: 0, totalBytes: 0 },
    ]);
    expect(result.progress).toBe(0);
    expect(Number.isFinite(result.progress)).toBe(true);
  });
});
