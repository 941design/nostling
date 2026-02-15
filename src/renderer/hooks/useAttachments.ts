/**
 * Attachment Management Hook
 *
 * Manages the attachment list state for message composition.
 * Handles file validation, blob storage, and metadata management.
 */

import { useState } from 'react';
import { validateFile } from '../utils/attachment-validation';

export interface AttachmentMetadata {
  name: string;
  size: number;
  type: string;
  hash: string;
  localPath: string;
  thumbnailUrl?: string; // data URL for image thumbnails
  dimensions?: { width: number; height: number };
  blurhash?: string;
}

export interface UseAttachmentsReturn {
  attachments: AttachmentMetadata[];
  addAttachment: (filePath: string, file?: File) => Promise<{ success: boolean; error?: string }>;
  removeAttachment: (index: number) => void;
  clearAttachments: () => void;
}

/**
 * Hook for managing message attachments
 *
 * CONTRACT:
 *   Inputs:
 *     - None
 *
 *   Outputs:
 *     - attachments: array of attachment metadata
 *     - addAttachment: async function to add file by path, returns { success: boolean, error?: string }
 *     - removeAttachment: function to remove by index
 *     - clearAttachments: function to clear all
 *
 *   Invariants:
 *     - Files are validated before storage
 *     - Only valid files are added to the list
 *     - Thumbnails generated for images (client-side for instant preview)
 *     - Hash and metadata come from BlobStorageService via IPC
 *
 *   Properties:
 *     - Validation: files validated before blob storage
 *     - Error handling: returns error messages on failure
 *     - State management: attachments array updated atomically
 */
export function useAttachments(): UseAttachmentsReturn {
  const [attachments, setAttachments] = useState<AttachmentMetadata[]>([]);

  const addAttachment = async (
    filePath: string,
    file?: File
  ): Promise<{ success: boolean; error?: string }> => {
    // Validate file before IPC call to avoid unnecessary round-trips
    if (file) {
      // Drag-and-drop: File object provides all info for validation
      const validation = validateFile({
        name: file.name,
        size: file.size,
        type: file.type,
      });

      if (!validation.valid) {
        return { success: false, error: validation.reason };
      }
    } else {
      // File picker: validate file size via lightweight IPC call
      // (MIME type is constrained by dialog filters in handleAttachClick)
      try {
        const fileInfo = await window.api.blobStorage?.getFileInfo(filePath);
        if (fileInfo) {
          if (fileInfo.size === 0) {
            return { success: false, error: 'File is empty' };
          }
          if (fileInfo.size > 25 * 1024 * 1024) {
            const sizeMB = (fileInfo.size / (1024 * 1024)).toFixed(1);
            return { success: false, error: `File size (${sizeMB} MB) exceeds maximum allowed size of 25 MB` };
          }
        }
      } catch {
        // getFileInfo failure is non-fatal; storeBlob will handle the file
      }
    }

    try {
      // Store the file via IPC to main process blob storage
      const result = await window.api.blobStorage?.storeBlob(filePath);
      if (!result) {
        return { success: false, error: 'Blob storage not available' };
      }

      const { hash, metadata } = result;

      // Generate thumbnail client-side for instant preview (if File object available and it's an image)
      let thumbnailUrl: string | undefined;
      if (file && file.type.startsWith('image/')) {
        try {
          thumbnailUrl = await generateThumbnail(file);
        } catch {
          // Thumbnail generation failure is non-fatal
        }
      }

      // Extract the file name from the path
      const fileName = file?.name ?? filePath.split(/[/\\]/).pop() ?? 'attachment';

      const attachmentMetadata: AttachmentMetadata = {
        name: fileName,
        size: metadata.sizeBytes,
        type: metadata.mimeType,
        hash,
        localPath: metadata.localPath,
        thumbnailUrl,
        dimensions: metadata.dimensions ?? undefined,
        blurhash: metadata.blurhash ?? undefined,
      };

      setAttachments((prev) => [...prev, attachmentMetadata]);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process attachment',
      };
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => {
      const attachment = prev[index];
      // Clean up thumbnail object URL if it's a blob: URL
      if (attachment?.thumbnailUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(attachment.thumbnailUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const clearAttachments = () => {
    // Clean up thumbnail object URLs
    attachments.forEach((attachment) => {
      if (attachment.thumbnailUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(attachment.thumbnailUrl);
      }
    });
    setAttachments([]);
  };

  return {
    attachments,
    addAttachment,
    removeAttachment,
    clearAttachments,
  };
}

/**
 * Generate a thumbnail for an image file
 */
async function generateThumbnail(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to get canvas context'));
        return;
      }

      // Generate thumbnail max 100x100
      const maxSize = 100;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL());
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}
