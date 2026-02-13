/**
 * Blob Storage IPC Handlers
 *
 * Handles file attachment operations including:
 * - Storing blobs with content-addressing
 * - EXIF stripping for images
 * - Metadata extraction
 */

import { ipcMain } from 'electron';
import { BlobStorageService } from '../blob-storage/BlobStorageService';

export interface BlobStorageIpcDependencies {
  blobStorageService: BlobStorageService;
}

/**
 * Register blob storage IPC handlers
 */
export function registerBlobStorageHandlers(dependencies: BlobStorageIpcDependencies): void {
  const { blobStorageService } = dependencies;

  // Store blob from file path
  ipcMain.handle('blob-storage:store-blob', async (_, filePath: string) => {
    return blobStorageService.storeBlob(filePath);
  });

  // Get blob metadata and verify file exists
  ipcMain.handle('blob-storage:get-blob', async (_, hash: string) => {
    return blobStorageService.getBlob(hash);
  });

  // Manual cleanup trigger
  ipcMain.handle('nostling:media:cleanup', async (_, options?: { retentionDays?: number; quotaBytes?: number }) => {
    return blobStorageService.runCleanup(options?.retentionDays, options?.quotaBytes);
  });

  // Get storage usage
  ipcMain.handle('nostling:media:storage-usage', async () => {
    return blobStorageService.getStorageUsage();
  });
}
