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
}
