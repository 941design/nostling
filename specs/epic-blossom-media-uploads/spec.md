---
epic: blossom-media-uploads
created: 2026-02-13T00:00:00Z
status: initializing
---

# Blossom Media Uploads

## Problem Statement

Nostling currently supports text-only messages (listed as an explicit non-goal in section 1.3). Users have no way to share images, files, or other media in conversations. Adding media support via Blossom (BUD-06) servers enables file sharing while preserving the offline-first, privacy-oriented architecture.

## Core Functionality

Content-addressed media uploads to user-configured Blossom servers, integrated with the existing offline message queue. Media is hashed and stored locally at attachment time, then uploaded and published when connectivity is available.

## Terminology

- **Blob**: A locally stored binary file keyed by SHA-256 hash.
- **Attachment**: A blob referenced by a message.
- **Placeholder**: A temporary `local-blob:<sha256>` reference used prior to upload.

## Functional Requirements

### FR-1: Attachment UI Workflow

**Attachment button:**
- Paperclip icon button in the message input area, to the left of the emoji picker
- Click opens the OS native file picker dialog
- Button disabled when no identity or contact is selected (same conditions as the Send button)

**Drag-and-drop:**
- Dragging a file over the conversation pane shows a drop zone overlay with visual feedback
- Dropping a file triggers the same attachment flow as the file picker

**Compose area with pending attachment:**
- After file selection, an attachment preview strip appears between the message list and the text input
- Image files: thumbnail preview (max ~120px height) with file name and size
- Non-image files: MIME-type icon with file name and size
- Each attachment has a remove (X) button to discard it before sending
- Multiple attachments supported; preview strip scrolls horizontally if needed
- Text input remains functional — user can add a caption/message alongside the attachment
- Send button (and Enter key) sends the message with all pending attachments
- After send, the attachment preview strip clears

**Validation on attach:**
- Reject files exceeding the max file size (default: 25 MB) with an inline error toast
- Reject unsupported MIME types with an inline error toast
- Supported types: images (JPEG, PNG, GIF, WebP), video (MP4, WebM), audio (MP3, OGG, WAV), documents (PDF)

### FR-2: File Hashing and Local Persistence

- On file selection (before send), immediately compute the SHA-256 content hash using streaming
- Store the raw binary in local blob storage, keyed by hash (deduplication by default)
- Generate metadata: MIME type, file size, dimensions (for images), and optional blurhash preview
- Hashing and storage happen asynchronously; the attachment preview shows a brief spinner if the file is large

### FR-3: Message Construction with Placeholder References

- Construct the outgoing Nostr event with a `local-blob:<sha256>` placeholder in place of the final remote URL
- Include file metadata in the event (MIME type, dimensions, blurhash) so the UI can render a preview before upload completes
- The message enters the existing offline queue with status `queued`, same as text messages
- Store association between message ID and blob hash(es) for later URL replacement

**Event tag schema (NIP-94 / NIP-92 compatibility):**
- Each attachment is represented with an `imeta` tag (preferred) containing:
  - `url <remote-url>` (or `url local-blob:<sha256>` pre-upload)
  - `m <mime-type>`
  - `size <bytes>`
  - `dim <width>x<height>` for images/video posters if known
  - `blurhash <blurhash>` when available
  - `sha256 <hex>` for content-addressed integrity
- If the client does not yet support `imeta`, include a fallback `url` tag for each attachment (same URL or placeholder) for backward compatibility.

**Multiple attachments and ordering:**
- Preserve attachment order as selected by the user.
- Each attachment produces its own `imeta` tag. The ordering of tags matches selection order.
- The message body is treated as a caption for the entire attachment set (not tied to a single attachment).

**Encryption boundary (NIP-17/59):**
- Replace placeholders before encryption and publish only fully resolved URLs.
- If using encrypted content, all attachment tags live inside the encrypted payload alongside the message content.

### FR-4: Upload and Publish Pipeline

- On connectivity restoration (relay connected + Blossom server reachable):
  1. Select target Blossom server(s) from identity-level configuration
  2. Upload the locally stored blob using BUD-06 HTTP PUT with NIP-98 auth
  3. On successful upload, obtain the public URL from the server response
  4. Replace `local-blob:<sha256>` placeholder(s) in the queued event with the real URL(s) and full metadata tags
  5. Publish the updated event via the normal NIP-17/59 encryption and relay publish flow
- If upload fails, mark the message status as `error` with a descriptive reason
- Retry with exponential backoff, consistent with the existing message queue retry behavior

**Upload timing:**
- If online, begin upload immediately after the user clicks Send (not at selection time).
- If offline, queue and upload when connectivity is restored.

**Partial failure handling:**
- A message is not published until all attachments are successfully uploaded.
- If any attachment fails, the message remains in `error` with per-attachment failure details.
- Retrying the message retries only failed attachments.

**Concurrency:**
- Limit parallel uploads to 2 per identity to avoid saturating bandwidth/UI.

### FR-5: Blossom Server Configuration

- Per-identity Blossom server list (URL + optional label)
- Add, remove, and reorder servers in identity settings
- Default server suggestion (configurable, no hardcoded default)
- Server health check: HEAD request to verify reachability before upload attempt
- Fallback to next server in list on upload failure

**Health check details:**
- Use HEAD on the Blossom server base URL.
- Timeout after 3 seconds; if timeout or non-2xx, mark server as unhealthy for this attempt.

### FR-6: Media Rendering in Conversation

**Outgoing messages (pending upload):**
- Message bubble shows local preview from blob storage
- Upload progress bar overlay on the media thumbnail
- Status indicator follows existing pattern: queued (clock) → uploading (progress) → sending (spinner) → sent (checkmark) → error (warning)
- On error, a retry button appears on the message bubble

**Outgoing messages (sent):**
- Inline image thumbnail (click to expand in lightbox/overlay)
- Non-image files: download link with file name, size, and MIME icon

**Incoming messages:**
- Fetch media from URL in event tags, cache locally (extend existing image cache)
- Blurhash placeholder shown while media loads or when offline
- Inline image thumbnail with click-to-expand
- Non-image files: download link with file name, size, and MIME icon

### FR-7: Local Blob Storage

- Location: `{userData}/blobs/` directory, files named by SHA-256 hash
- Separate from the existing image cache (which is URL-keyed for profile images)
- Cleanup policy: remove local blob after successful upload + configurable retention grace period (default: 7 days)
- Storage quota: configurable max total blob storage (default: 500 MB), LRU eviction of already-uploaded blobs

### FR-8: Database Schema Additions

- `media_blobs` table: hash (PK), mime_type, size_bytes, dimensions_json, blurhash, local_path, uploaded_at, created_at
- `message_media` junction table: message_id (FK), blob_hash (FK), remote_url, placeholder_key, upload_status
- Index on `message_media.upload_status` for pending upload queries

### FR-9: NIP-98 Authentication

- HTTP Authorization header with signed Nostr event (kind 27235) for Blossom uploads
- Event signed with the active identity's key
- Payload: HTTP method, URL, SHA-256 of request body
- Token validity window: short-lived (e.g., 60 seconds)

## Non-Functional Requirements

- Upload must not block the UI thread; all I/O on the main process with progress reported via IPC
- Blob hashing should use streaming SHA-256 (no full-file buffering for large files)
- Upload progress exposed to renderer for per-message progress bars
- Privacy: no metadata leakage beyond what the user explicitly attaches (strip EXIF by default for images)
- E2E test setup must include a local Blossom server to exercise upload flow end-to-end

## Critical Constraints

- `local-blob:` placeholders must never be published to relays; the publish step must validate that all placeholders are resolved
- Messages with unresolved media must remain in `queued` status until all blobs are uploaded
- The existing message queue flush logic must be extended, not replaced, to handle media-bearing messages
- Blossom server URLs are per-identity (different identities may use different servers)
- NIP-98 auth tokens must be generated per-request (not cached or reused)

## Security Considerations

- EXIF stripping is mandatory by default for images to prevent location/device leakage
- NIP-98 tokens are scoped to specific upload requests and short-lived
- Blob storage on disk is unencrypted (consistent with existing SQLite database); OS-level disk encryption is assumed
- Blossom server TLS is required (no HTTP fallback)

## Implementation Clarifications

The following clarifications were established during specification validation:

### Encryption and Placeholder Timing
- Messages are stored **unencrypted** in the queue with `local-blob:` placeholders
- NIP-17/59 encryption happens **at publish time** after all uploads complete and placeholders are resolved
- This ensures placeholders never appear in encrypted relay content

### Database Schema Integration
- Add `media_json` column to `nostr_messages` table to store attachment metadata alongside message content
- New tables `media_blobs` and `message_media` provide content-addressed storage and message associations
- Migration file: `20260213_add_media_support.ts`

### NIP Compatibility
- **Outgoing**: Use NIP-94 `imeta` tags exclusively for modern compatibility
- **Incoming**: Accept both NIP-94 `imeta` tags and legacy NIP-92 `url` tags for backward compatibility
- Tag parser must handle both formats gracefully

### Retry Policy
- Match existing message publish retry behavior for consistency:
  - Initial delay: 1 second
  - Backoff multiplier: 2x
  - Maximum delay: 30 seconds
  - Maximum attempts: 5
- After 5 failed attempts, mark as permanent error with retry button for manual retry

### Media Cache Strategy
- **Received media**: Use existing URL-keyed image cache (same as profile images)
- **Outgoing attachments**: Use content-addressed `{userData}/blobs/` storage
- This maintains separation between cached remote content and local pending uploads

### IPC Channels
Following the `nostling:domain:action` pattern:
- `nostling:media:attach` - Attach file from renderer
- `nostling:media:upload-progress` - Progress updates (main → renderer)
- `nostling:media:cancel-upload` - Cancel in-progress upload
- `nostling:media:cleanup` - Trigger blob cleanup

### EXIF Stripping Failure
- Abort **at file selection** with immediate error toast
- Attachment is not added to preview; user must fix or choose different file
- This prevents queuing messages with problematic images

### Blossom Server Configuration
- No default server suggestion; users must configure manually
- Identity settings UI provides clear prompts for adding first server
- No hardcoded defaults or environment variable overrides (users provide their own trusted servers)

### Blurhash Generation
- Generated for **image files only** (JPEG, PNG, GIF, WebP)
- Skipped for video, audio, and document attachments
- Used as placeholder while media loads or when offline

### Upload Concurrency
- Limit: **2 concurrent blob uploads per identity** (total across all messages and attachments)
- Prevents bandwidth saturation while allowing reasonable parallelism
- Additional uploads queue until slots become available

## Error Handling and Edge Cases

- Server-side size/type rejection must produce a clear error message in the UI (e.g., "Server rejected file type" or "File too large for server").
- If EXIF stripping fails, reject at file selection with error toast (see Implementation Clarifications above).
- If the app closes mid-upload, resume on next launch using the queued state and existing blobs.
- Allow user to cancel an in-progress upload; canceled uploads revert to `queued` and can be retried.

## Storage and Cleanup Clarifications

- Received media is cached separately from `media_blobs` and governed by existing cache policies.
- Uploaded local blobs are eligible for cleanup after the retention grace period.
- If the same blob is attached across multiple identities, retain it until all referencing messages are sent or expired.

## Acceptance Criteria

- User can attach an image in conversation; it displays as a local preview immediately
- Message with attachment queues when offline, uploads blob on reconnect, publishes event with real URL
- Incoming media messages render inline with cached media
- Failed uploads show error status with retry option
- EXIF data stripped from uploaded images
- `local-blob:` placeholders never appear in published relay events
- Per-identity Blossom server configuration persists across restarts
- Blob cleanup removes uploaded files after retention period expires
- Storage quota enforced via LRU eviction of uploaded blobs
