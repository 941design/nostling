/**
 * Attachment file validation utility
 *
 * Validates files for attachment to messages based on size and MIME type constraints.
 */

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

const SUPPORTED_MIME_TYPES = new Set([
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  // Videos
  'video/mp4',
  'video/webm',
  // Audio
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  // Documents
  'application/pdf',
]);

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export interface FileToValidate {
  name: string;
  size: number;
  type: string;
}

/**
 * Validate a file for attachment
 *
 * CONTRACT:
 *   Inputs:
 *     - file: object with name (string), size (number in bytes), type (MIME type string)
 *
 *   Outputs:
 *     - { valid: true } if file passes validation
 *     - { valid: false, reason: string } if file fails validation with user-friendly message
 *
 *   Invariants:
 *     - Files larger than 25 MB are rejected
 *     - Files with unsupported MIME types are rejected
 *     - Empty files (size 0) are rejected
 *
 *   Properties:
 *     - Deterministic: same input always produces same output
 *     - Non-mutating: does not modify input file object
 */
export function validateFile(file: FileToValidate): ValidationResult {
  // Check for empty file
  if (file.size === 0) {
    return {
      valid: false,
      reason: 'File is empty',
    };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      reason: `File size (${sizeMB} MB) exceeds maximum allowed size of 25 MB`,
    };
  }

  // Check MIME type
  if (!SUPPORTED_MIME_TYPES.has(file.type)) {
    return {
      valid: false,
      reason: `File type "${file.type || 'unknown'}" is not supported. Supported types: images (JPEG, PNG, GIF, WebP), videos (MP4, WebM), audio (MP3, OGG, WAV), and PDF documents.`,
    };
  }

  return { valid: true };
}

/**
 * Get a human-readable description of supported file types
 */
export function getSupportedTypesDescription(): string {
  return 'Images (JPEG, PNG, GIF, WebP), Videos (MP4, WebM), Audio (MP3, OGG, WAV), PDF documents';
}

/**
 * Get maximum file size in bytes
 */
export function getMaxFileSize(): number {
  return MAX_FILE_SIZE;
}
