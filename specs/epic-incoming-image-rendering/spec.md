---
epic: incoming-image-rendering
created: 2026-02-20T00:00:00Z
status: draft
---

# Incoming Image Message Rendering

## Problem Statement

Nostling cannot display image content received from other Nostr clients. There are multiple compounding gaps:

1. **Kind 15 (file messages) silently dropped**: `decryptNip17Message()` in `crypto.ts` hard-checks `rumor.kind !== 14` and returns null for anything else. NIP-17 defines kind 15 for file/media messages. When another client (e.g., one using nostr.build as its blossom server) sends an image as a kind-15 file message inside a gift wrap, Nostling silently discards it. The `processGiftWrapEvent` flow falls through to the "neither profile, DM, nor P2P signal" debug log with no user-visible indication that a message was received.

2. **No inline image rendering from URLs in message text**: The `MessageContent` component renders URLs as clickable blue text links only. If a kind-14 chat message contains a blossom URL (e.g., `https://nostr.build/blob/<hash>.jpg`) in the `content` field without structured `imeta` tags, the user sees a raw URL, not an image.

3. **MIME type inference absent for incoming media**: When an incoming `imeta` tag omits the `m` (MIME type) field, the attachment's `mimeType` is undefined. `isImageMimeType(undefined)` returns false, causing the image to render as a generic file download link instead of a visual thumbnail.

4. **Narrow receiving format support**: Outgoing validation (`attachment-validation.ts`) limits uploads to JPEG, PNG, GIF, WebP. But incoming messages from other clients may contain additional image formats (AVIF, BMP, TIFF, HEIC, SVG). These should be renderable on receive even if Nostling doesn't allow sending them.

### Triggering Scenario

A contact using a different Nostr client sent an image hosted on `nostr.build` to `npub1ykl7k2lnvqv9eauqzmmj6uukqtfkxxm0a5ylcrcvfcecgcu3gzfqv9v55n`. The message arrived as a NIP-17/59 gift-wrapped event. The blossom server (nostr.build) accepted and served the blob. Nostling either:
- Silently dropped the event (if the inner rumor was kind 15), or
- Stored the message text but rendered the image URL as a plain link (if the inner rumor was kind 14 with an image URL in content)

In neither case was the image visually displayed in the chat.

## Core Functionality

Accept and visually render image content from incoming NIP-17 messages regardless of how the sending client structured the media reference (kind 14 with URL in content, kind 14 with imeta tags, or kind 15 file messages). Provide graceful degradation for unknown formats and missing metadata.

## Functional Requirements

### FR-1: Accept NIP-17 Kind 15 File Messages

The `decryptNip17Message` function currently rejects all non-kind-14 rumors. Extend it to also accept kind 15 (file message, as defined by NIP-17).

When a kind-15 rumor is unwrapped:
- Extract `content` (URL to the file)
- Extract tags: `file-type` (MIME), `dim`, `blurhash`, `x` (SHA-256 hash), and encryption metadata if present (`encryption-algorithm`, `decryption-key`, `decryption-nonce`)
- Pass the rumor through to `ingestIncomingMessage` with `kind: 15` and the full tag set
- `ingestIncomingMessage` builds `mediaJson` from the kind-15 tags, mapping them to the existing `ParsedMediaAttachment` structure

The `processGiftWrapEvent` check `if (dmResult && dmResult.kind === 14)` must be relaxed to also accept kind 15.

### FR-2: Inline Image Detection in Message Text Content

When rendering a message's text content, detect URLs that point to known image resources and render them as inline image previews instead of (or in addition to) clickable text links.

**Detection heuristics** (applied only when no `mediaJson` is present on the message, to avoid double-rendering):
- URL path ends with a known image extension: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.avif`, `.bmp`, `.svg`
- URL hostname matches a known blossom server pattern (any URL containing `/blob/` or matching the user's configured blossom server list)

**Rendering behavior:**
- Detected image URLs are extracted from the text content and rendered as `CachedImage` components below the text, similar to `MediaAttachments`
- The original URL remains in the text as a clickable link (for context and fallback)
- A lightbox click-to-expand interaction applies, consistent with existing `ImageAttachment` behavior
- If the image fails to load (404, network error, unsupported format), fall back to showing just the clickable link with no broken image indicator

### FR-3: MIME Type Inference from URL and Tags

When an incoming media attachment has no explicit MIME type (`m` field missing from `imeta`, or `file-type` tag absent from kind-15):

1. **Infer from URL file extension**: Map common extensions to MIME types (`.jpg`/`.jpeg` -> `image/jpeg`, `.png` -> `image/png`, `.gif` -> `image/gif`, `.webp` -> `image/webp`, `.avif` -> `image/avif`, `.mp4` -> `video/mp4`, `.pdf` -> `application/pdf`, etc.)
2. **Infer from blossom server response**: When fetching the image for cache, use the `Content-Type` response header as a secondary MIME type signal
3. **Default for blossom URLs without extension**: Treat blossom blob URLs (pattern: `https://<host>/blob/<sha256>` with no extension) as potentially renderable images and attempt to load them via `CachedImage`. If the loaded content is not an image (wrong content type), fall back to file link.

This inference applies at the `parseImetaTags` / `parseIncomingMedia` level in `media-parser.ts` and at the `CachedImage` rendering level.

### FR-4: Extended Incoming Image Format Support

Expand the set of MIME types recognized as images for **incoming** message rendering. This does NOT change the outgoing attachment validation (which remains JPEG, PNG, GIF, WebP).

**Additional receivable image MIME types:**
- `image/avif` (AVIF)
- `image/bmp` (BMP)
- `image/tiff` (TIFF)
- `image/heic` and `image/heif` (HEIC/HEIF - Apple format)
- `image/svg+xml` (SVG)

Chromium (and therefore Electron) natively supports rendering AVIF, BMP, SVG, and WebP. For formats Chromium cannot render natively (TIFF, HEIC), show the file as a download link with an appropriate icon rather than a broken image.

The `isImageMimeType` function must recognize all of these as image types. A separate `isRenderableImageMimeType` function determines whether to attempt inline rendering versus showing a download link.

### FR-5: Kind-15 File Message Media JSON Construction

When ingesting a kind-15 file message, construct the `mediaJson` database field from the kind-15 specific tags:

| Kind-15 Tag | Maps To (ParsedMediaAttachment) |
|---|---|
| `content` (URL) | `url` |
| `file-type` tag value | `mimeType` |
| `dim` tag value (if present) | `dimensions` |
| `blurhash` tag value (if present) | `blurhash` |
| `x` tag value (SHA-256, if present) | `sha256` |
| `thumb` tag value (if present) | thumbnail URL (new field, optional) |

The mapping from kind-15 tags to `mediaJson` happens in `ingestIncomingMessage` (or a helper called from it). The stored format uses the same `{"tags": [...]}` structure as kind-14 imeta tags for consistency in the renderer.

### FR-6: Graceful Handling of Unknown Wrapped Event Kinds

Currently, unwrapped events that are not kind 14 are silently discarded with a debug log. Improve this:

- For kind 15: process as a file message (FR-1)
- For other known kinds that Nostling doesn't handle (e.g., kind 11 for chat channels): log at info level with the kind number, discard gracefully
- For completely unknown kinds: log at info level with the kind number and event ID, discard gracefully
- Never show an error to the user for unrecognized kinds -- the sender may be using a newer protocol version

The key distinction: kind 14 and 15 are processed; everything else is logged and discarded without error.

## Non-Functional Requirements

- Image URL detection in message text must not introduce rendering latency for text-only messages. Use lazy/deferred image loading.
- MIME type inference is a pure, synchronous operation (string matching). No network requests at parse time.
- Kind-15 processing must not break existing kind-14 message handling. The change to `decryptNip17Message` is additive.
- Image rendering for incoming messages reuses the existing `CachedImage` component and image cache infrastructure. No new caching mechanism required.

## Critical Constraints

- **No changes to outgoing message format**: Nostling continues to send kind-14 messages with `imeta` tags. Kind 15 is receive-only.
- **No changes to outgoing attachment validation**: The upload file picker still limits to JPEG, PNG, GIF, WebP, etc. Extended format support is receive-only.
- **No Content-Type sniffing for security**: Do not render `application/octet-stream` blobs as images by content-sniffing. Only render images when MIME type is explicitly known (from tags, URL extension, or HTTP headers from a trusted blossom server).
- **Existing encrypted media spec unaffected**: The `epic-encrypted-media-blobs` spec handles AES-GCM encryption of outgoing blobs. This spec is about receiving and displaying incoming images from other clients, which may or may not be encrypted.
- **MediaJson backward compatibility**: The `parseMediaJson` function must continue to handle both the outgoing `{"attachments": [...]}` format and the incoming `{"tags": [...]}` format without breaking.

## Security Considerations

- **SVG rendering**: SVG can contain scripts. If rendering SVG inline, sanitize or use `<img>` tag (which disables scripts). Chromium's `<img>` tag for SVG is script-safe. Never render SVG via `<iframe>` or `dangerouslySetInnerHTML`.
- **URL validation**: Only render images from `https://` URLs. Never render images from `http://`, `javascript:`, `data:`, or `file://` URLs found in incoming message content.
- **Blossom trust**: Image URLs from `imeta` tags inside NIP-17/59 encrypted envelopes are semi-trusted (the sender chose them). Image URLs found in plaintext message content receive the same trust level.

## Affected Components

- `src/main/nostling/crypto.ts` -- `decryptNip17Message`: accept kind 14 AND kind 15
- `src/main/nostling/service.ts` -- `processGiftWrapEvent`: handle kind 15 alongside kind 14; `ingestIncomingMessage`: construct mediaJson from kind-15 tags
- `src/renderer/utils/media-parser.ts` -- MIME inference from URL extension; parse kind-15 tag format
- `src/renderer/utils/linkify.ts` -- detect image URLs for inline rendering
- `src/renderer/main.tsx` -- `MessageContent` or new sibling component: render detected image URLs inline
- `src/renderer/components/MediaAttachments/MediaAttachments.tsx` -- handle missing MIME with inference; recognize extended image formats
- `src/renderer/utils/attachment-validation.ts` -- no changes (outgoing only)

## Acceptance Criteria

- A NIP-17 kind-15 file message containing an image URL is received and the image renders inline in the chat conversation
- A NIP-17 kind-14 chat message containing a blossom image URL in its text content (without imeta tags) renders the image inline below the message text
- A NIP-17 kind-14 chat message with imeta tags (but missing the `m` MIME field) still renders the image correctly by inferring MIME from the URL extension
- An incoming message with AVIF, BMP, or SVG image content renders inline (where Chromium supports the format)
- An incoming message with HEIC or TIFF image content shows a file download link (not a broken image)
- An incoming wrapped event of an unrecognized kind (e.g., kind 42) is logged and discarded without error or UI glitch
- Existing kind-14 text-only and kind-14-with-imeta message rendering remains unchanged
- No changes to outgoing message format or upload validation
- Image URLs in text content are only rendered inline when no `mediaJson` already exists on the message (no double-rendering)
- Inline image detection does not slow down rendering of text-only messages
