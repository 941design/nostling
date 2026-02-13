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
  addAttachment: (file: File) => Promise<{ success: boolean; error?: string }>;
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
 *     - addAttachment: async function to add file, returns { success: boolean, error?: string }
 *     - removeAttachment: function to remove by index
 *     - clearAttachments: function to clear all
 *
 *   Invariants:
 *     - Files are validated before storage
 *     - Only valid files are added to the list
 *     - Thumbnails generated for images
 *
 *   Properties:
 *     - Validation: files validated before blob storage
 *     - Error handling: returns error messages on failure
 *     - State management: attachments array updated atomically
 */
export function useAttachments(): UseAttachmentsReturn {
  const [attachments, setAttachments] = useState<AttachmentMetadata[]>([]);

  const addAttachment = async (file: File): Promise<{ success: boolean; error?: string }> => {
    // Validate file
    const validation = validateFile({
      name: file.name,
      size: file.size,
      type: file.type,
    });

    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    try {
      // Create temporary path for the file
      // In a real implementation, we'd need to save the File object to a temp location
      // For now, we'll use the browser's ability to read the file directly
      const arrayBuffer = await file.arrayBuffer();
      const blob = new Blob([arrayBuffer]);
      const fileUrl = URL.createObjectURL(blob);

      // For images, generate thumbnail
      let thumbnailUrl: string | undefined;
      let dimensions: { width: number; height: number } | undefined;
      if (file.type.startsWith('image/')) {
        thumbnailUrl = await generateThumbnail(file);
        dimensions = await getImageDimensions(file);
      }

      // In a production implementation, we would:
      // 1. Save the file to a temporary location
      // 2. Call window.api.blobStorage.storeBlob(tempPath)
      // 3. Get back hash and metadata
      // For this UI-focused story, we'll simulate the metadata

      // Generate a simple hash for demo purposes
      const hash = await generateSimpleHash(arrayBuffer);

      const metadata: AttachmentMetadata = {
        name: file.name,
        size: file.size,
        type: file.type,
        hash,
        localPath: fileUrl, // In production, this would be the actual local path from blob storage
        thumbnailUrl,
        dimensions,
      };

      setAttachments((prev) => [...prev, metadata]);
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
      // Clean up object URL if it exists
      if (attachment && attachment.localPath.startsWith('blob:')) {
        URL.revokeObjectURL(attachment.localPath);
      }
      if (attachment && attachment.thumbnailUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(attachment.thumbnailUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const clearAttachments = () => {
    // Clean up all object URLs
    attachments.forEach((attachment) => {
      if (attachment.localPath.startsWith('blob:')) {
        URL.revokeObjectURL(attachment.localPath);
      }
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

/**
 * Get image dimensions
 */
async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Generate a simple hash from array buffer (for demo purposes)
 * In production, this would use the hash from blob storage service
 */
async function generateSimpleHash(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
