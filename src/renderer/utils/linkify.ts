/**
 * URL Detection and Parsing for Message Content
 *
 * Parses message text to identify URLs and split content into
 * text and link segments for rendering.
 */

export interface TextSegment {
  type: 'text';
  content: string;
}

export interface LinkSegment {
  type: 'link';
  url: string;
  displayText: string;
}

export type MessageSegment = TextSegment | LinkSegment;

// URL regex pattern - matches http:// and https:// URLs
// Captures URLs until whitespace or common punctuation that ends URLs
const URL_PATTERN = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

/**
 * Validate that a URL is safe to open (http/https only)
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Clean trailing punctuation from URL that's likely not part of the URL
 * e.g., "Check this: https://example.com." -> "https://example.com"
 */
function cleanTrailingPunctuation(url: string): string {
  // Remove trailing punctuation that's unlikely to be part of URLs
  return url.replace(/[.,;:!?)]+$/, '');
}

/**
 * Parse message content into segments of text and links
 *
 * @param content - Raw message text
 * @returns Array of segments (text and link)
 */
export function parseMessageContent(content: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let lastIndex = 0;

  // Reset regex state
  URL_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = URL_PATTERN.exec(content)) !== null) {
    const rawUrl = match[0];
    const cleanedUrl = cleanTrailingPunctuation(rawUrl);

    // Only process valid URLs
    if (!isValidUrl(cleanedUrl)) {
      continue;
    }

    // Add text before the URL
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: content.slice(lastIndex, match.index),
      });
    }

    // Add the URL segment
    segments.push({
      type: 'link',
      url: cleanedUrl,
      displayText: cleanedUrl,
    });

    // Move lastIndex, accounting for any trailing punctuation we removed
    lastIndex = match.index + cleanedUrl.length;

    // Adjust regex lastIndex if we removed trailing chars
    if (cleanedUrl.length < rawUrl.length) {
      URL_PATTERN.lastIndex = lastIndex;
    }
  }

  // Add remaining text after last URL
  if (lastIndex < content.length) {
    segments.push({
      type: 'text',
      content: content.slice(lastIndex),
    });
  }

  // If no URLs found, return single text segment
  if (segments.length === 0) {
    segments.push({
      type: 'text',
      content,
    });
  }

  return segments;
}
