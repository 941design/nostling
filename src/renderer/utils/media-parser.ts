/**
 * Media Parser - Extracts renderable media information from messages.
 *
 * Handles both outgoing messages (mediaJson from database) and incoming
 * messages (NIP-94 imeta tags and legacy NIP-92 url tags).
 */

export interface ParsedMediaAttachment {
  url: string;
  mimeType?: string;
  sizeBytes?: number;
  dimensions?: { width: number; height: number };
  blurhash?: string;
  sha256?: string;
  fileName?: string;
  isLocalBlob: boolean; // true if url starts with 'local-blob:'
}

/**
 * Parse media attachments from a message's mediaJson field.
 * Handles both outgoing format ({"attachments": [...]}) and
 * incoming format ({"tags": [["imeta", ...], ["url", ...]]}).
 */
export function parseMediaJson(mediaJsonStr: string | undefined): ParsedMediaAttachment[] {
  if (!mediaJsonStr) return [];

  try {
    const parsed = JSON.parse(mediaJsonStr);

    // Incoming format: stored tags from decrypted rumor
    if (parsed.tags && Array.isArray(parsed.tags)) {
      return parseIncomingMedia(parsed.tags);
    }

    if (!parsed.attachments || !Array.isArray(parsed.attachments)) return [];

    return parsed.attachments.map((attachment: {
      hash: string;
      name?: string;
      mimeType?: string;
      sizeBytes?: number;
      dimensions?: { width: number; height: number };
      blurhash?: string;
      imeta?: string[];
    }) => {
      // Extract URL from imeta tag if present
      let url = `local-blob:${attachment.hash}`;
      if (attachment.imeta) {
        const urlEntry = attachment.imeta.find((v: string) => v.startsWith('url '));
        if (urlEntry) {
          url = urlEntry.substring(4);
        }
      }

      return {
        url,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        dimensions: attachment.dimensions,
        blurhash: attachment.blurhash,
        sha256: attachment.hash,
        fileName: attachment.name,
        isLocalBlob: url.startsWith('local-blob:'),
      };
    });
  } catch {
    return [];
  }
}

/**
 * Parse media from NIP-94 imeta tags (used for incoming messages).
 *
 * imeta tag format: ["imeta", "url https://...", "m image/jpeg", "size 12345", ...]
 */
export function parseImetaTags(tags: string[][]): ParsedMediaAttachment[] {
  if (!tags) return [];

  return tags
    .filter(tag => tag[0] === 'imeta')
    .map(tag => {
      const entries = tag.slice(1);
      const props: Record<string, string> = {};

      for (const entry of entries) {
        const spaceIdx = entry.indexOf(' ');
        if (spaceIdx > 0) {
          props[entry.substring(0, spaceIdx)] = entry.substring(spaceIdx + 1);
        }
      }

      const url = props.url || '';
      return {
        url,
        mimeType: props.m || inferMimeFromUrl(url),
        sizeBytes: props.size ? parseInt(props.size, 10) : undefined,
        dimensions: props.dim ? parseDimensions(props.dim) : undefined,
        blurhash: props.blurhash,
        sha256: props.sha256,
        isLocalBlob: url.startsWith('local-blob:'),
      };
    })
    .filter(a => a.url.length > 0);
}

/**
 * Parse legacy NIP-92 url tags for backward compatibility.
 *
 * url tag format: ["url", "https://..."]
 */
export function parseNip92UrlTags(tags: string[][]): ParsedMediaAttachment[] {
  if (!tags) return [];

  return tags
    .filter(tag => tag[0] === 'url' && tag.length >= 2)
    .map(tag => ({
      url: tag[1],
      mimeType: inferMimeFromUrl(tag[1]),
      isLocalBlob: false,
    }));
}

/**
 * Parse incoming message tags, preferring NIP-94 imeta over NIP-92 url.
 */
export function parseIncomingMedia(tags: string[][] | undefined): ParsedMediaAttachment[] {
  if (!tags) return [];

  const imetaAttachments = parseImetaTags(tags);
  if (imetaAttachments.length > 0) return imetaAttachments;

  return parseNip92UrlTags(tags);
}

function parseDimensions(dim: string): { width: number; height: number } | undefined {
  const match = dim.match(/^(\d+)x(\d+)$/);
  if (!match) return undefined;
  return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
}

const EXTENSION_MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
  mp4: 'video/mp4',
  pdf: 'application/pdf',
};

/**
 * Infer MIME type from a URL's file extension.
 * Pure, synchronous operation — no network requests.
 * Returns undefined if the URL has no recognizable extension.
 */
export function inferMimeFromUrl(url: string): string | undefined {
  try {
    const pathname = new URL(url).pathname;
    const lastSegment = pathname.split('/').pop() || '';
    const dotIdx = lastSegment.lastIndexOf('.');
    if (dotIdx < 0) return undefined;
    const ext = lastSegment.substring(dotIdx + 1).toLowerCase();
    return EXTENSION_MIME_MAP[ext];
  } catch {
    return undefined;
  }
}

/**
 * Check if a URL is a blossom blob URL (extensionless, potentially an image).
 * Pattern: any HTTPS URL with /blob/ in the path.
 */
export function isBlobUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.pathname.includes('/blob/');
  } catch {
    return false;
  }
}

/**
 * Check if a MIME type represents an image.
 */
export function isImageMimeType(mimeType: string | undefined): boolean {
  if (!mimeType) return false;
  return mimeType.startsWith('image/');
}

/**
 * Format file size for display (e.g., "1.2 MB", "45 KB").
 */
export function formatFileSize(bytes: number | undefined): string {
  if (bytes === undefined || bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
