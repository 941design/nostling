/**
 * NIP-94 imeta tag builder for message attachments.
 *
 * Builds imeta tags with local-blob:<sha256> placeholder URLs before upload.
 * After upload, placeholders are replaced with real remote URLs.
 */

import { AttachmentData } from '../../shared/types';

export interface ImetaTag {
  url: string;
  m: string;
  size: string;
  sha256: string;
  dim?: string;
  blurhash?: string;
}

/**
 * Build a single imeta tag array from attachment data.
 *
 * The tag format follows NIP-94:
 *   ["imeta", "url <value>", "m <mime>", "size <bytes>", "dim <WxH>", "blurhash <hash>", "sha256 <hash>"]
 *
 * Before upload, the url is set to "local-blob:<sha256>".
 */
export function buildImetaTag(attachment: AttachmentData): string[] {
  const tag: string[] = ['imeta'];

  tag.push(`url local-blob:${attachment.hash}`);
  tag.push(`m ${attachment.mimeType}`);
  tag.push(`size ${attachment.sizeBytes}`);

  if (attachment.dimensions) {
    tag.push(`dim ${attachment.dimensions.width}x${attachment.dimensions.height}`);
  }

  if (attachment.blurhash) {
    tag.push(`blurhash ${attachment.blurhash}`);
  }

  tag.push(`sha256 ${attachment.hash}`);

  return tag;
}

/**
 * Build imeta tags for all attachments, preserving order.
 */
export function buildImetaTags(attachments: AttachmentData[]): string[][] {
  return attachments.map(buildImetaTag);
}

/**
 * Build the media_json object to store in the nostr_messages table.
 *
 * Contains the full attachment metadata and imeta tags for later use
 * during encryption and publishing.
 */
export function buildMediaJson(attachments: AttachmentData[]): string {
  const imetaTags = buildImetaTags(attachments);

  const mediaJson = {
    attachments: attachments.map((attachment, index) => ({
      hash: attachment.hash,
      name: attachment.name,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      dimensions: attachment.dimensions,
      blurhash: attachment.blurhash,
      imeta: imetaTags[index],
    })),
  };

  return JSON.stringify(mediaJson);
}
