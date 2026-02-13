/**
 * Upload Progress Hook
 *
 * Tracks upload progress for media attachments via IPC events.
 * Provides per-message, per-blob progress data for rendering
 * upload progress bars in message bubbles.
 */

import { useEffect, useRef, useState } from 'react';

export interface UploadProgressEntry {
  messageId: string;
  blobHash: string;
  status: 'uploading' | 'completed' | 'error';
  bytesUploaded: number;
  totalBytes: number;
  error?: string;
}

export interface MessageUploadProgress {
  /** Overall progress 0-1 across all blobs for this message */
  progress: number;
  /** Per-blob status entries */
  blobs: UploadProgressEntry[];
  /** True if any blob has an error */
  hasError: boolean;
  /** True if all blobs are completed */
  isComplete: boolean;
}

/**
 * Hook that listens to upload progress IPC events and provides
 * per-message progress data.
 */
export function useUploadProgress(): Map<string, MessageUploadProgress> {
  const [progressMap, setProgressMap] = useState<Map<string, MessageUploadProgress>>(new Map());
  const blobsRef = useRef<Map<string, UploadProgressEntry>>(new Map());

  useEffect(() => {
    const cleanup = window.api.nostling?.media?.onUploadProgress((progress: UploadProgressEntry) => {
      const key = `${progress.messageId}:${progress.blobHash}`;
      blobsRef.current.set(key, progress);

      // Rebuild per-message progress
      const byMessage = new Map<string, UploadProgressEntry[]>();
      for (const entry of blobsRef.current.values()) {
        const existing = byMessage.get(entry.messageId) || [];
        existing.push(entry);
        byMessage.set(entry.messageId, existing);
      }

      const newMap = new Map<string, MessageUploadProgress>();
      for (const [messageId, blobs] of byMessage) {
        const totalBytes = blobs.reduce((sum, b) => sum + b.totalBytes, 0);
        const uploadedBytes = blobs.reduce((sum, b) => sum + b.bytesUploaded, 0);
        newMap.set(messageId, {
          progress: totalBytes > 0 ? uploadedBytes / totalBytes : 0,
          blobs,
          hasError: blobs.some(b => b.status === 'error'),
          isComplete: blobs.every(b => b.status === 'completed'),
        });
      }

      setProgressMap(newMap);
    });

    return cleanup;
  }, []);

  return progressMap;
}
