# Acceptance Criteria: Blossom Media Uploads

Generated: 2026-02-13T00:00:00Z
Source: spec.md

## Overview

These acceptance criteria verify the complete implementation of content-addressed media uploads via Blossom servers, integrated with Nostling's offline-first message queue. Each criterion is testable without production deployment using the dual-instance test environment and local Blossom server.

## Criteria

### AC-001: Attachment UI - File Picker Workflow
- **Description**: User can click the paperclip icon to open native file picker and select a file for attachment. The button state matches Send button conditions (disabled when no identity or contact selected).
- **Verification**:
  1. Start dual-instance environment (`make dev-dual`)
  2. Use Playwright to verify button is disabled without identity/contact
  3. Select identity and contact, verify button becomes enabled
  4. Click paperclip, verify file picker dialog opens (inspect DOM state change)
- **Type**: e2e
- **Source**: FR-1 Attachment button

### AC-002: Attachment UI - Drag and Drop
- **Description**: Dragging a file over the conversation pane shows drop zone overlay; dropping triggers attachment flow.
- **Verification**:
  1. Use Playwright `browser_evaluate` to simulate dragenter event with file
  2. Verify drop zone overlay appears (screenshot comparison or DOM query)
  3. Simulate drop event, verify attachment preview strip appears
- **Type**: e2e
- **Source**: FR-1 Drag-and-drop

### AC-003: Attachment UI - Preview Strip Display
- **Description**: After file selection, preview strip appears with thumbnail (images) or MIME icon (other files), file name, size, and remove button.
- **Verification**:
  1. Attach test image file via file picker
  2. Query DOM for preview strip element containing thumbnail, file name, size
  3. Verify remove (X) button is present
  4. Attach non-image file (PDF), verify MIME icon displayed instead of thumbnail
- **Type**: e2e
- **Source**: FR-1 Compose area with pending attachment

### AC-004: Attachment UI - Multiple Attachments
- **Description**: Multiple attachments supported; preview strip scrolls horizontally; each has independent remove button.
- **Verification**:
  1. Attach 3 files sequentially
  2. Verify preview strip contains 3 items
  3. Check for horizontal scroll container (CSS overflow-x)
  4. Click remove on middle item, verify only that item removed
- **Type**: e2e
- **Source**: FR-1 Multiple attachments supported

### AC-005: Attachment UI - Send with Caption
- **Description**: Text input remains functional alongside attachments; Send button sends message with all pending attachments; preview clears after send.
- **Verification**:
  1. Attach file, type caption in text input
  2. Click Send (or press Enter)
  3. Verify message appears in conversation with both caption and attachment
  4. Verify preview strip cleared after send
- **Type**: e2e
- **Source**: FR-1 Text input remains functional

### AC-006: Attachment Validation - File Size Rejection
- **Description**: Files exceeding max size (default 25 MB) are rejected with inline error toast.
- **Verification**:
  1. Create test file >25 MB (`dd if=/dev/zero of=large.bin bs=1M count=26`)
  2. Attempt to attach via file picker
  3. Verify error toast appears with size rejection message
  4. Verify attachment preview does not appear
- **Type**: e2e
- **Source**: FR-1 Validation on attach

### AC-007: Attachment Validation - MIME Type Rejection
- **Description**: Unsupported MIME types rejected with inline error toast. Supported: images (JPEG, PNG, GIF, WebP), video (MP4, WebM), audio (MP3, OGG, WAV), documents (PDF).
- **Verification**:
  1. Create test file with unsupported type (e.g., `.exe`, `.zip`)
  2. Attempt to attach
  3. Verify error toast with MIME rejection message
  4. Attach supported types (JPEG, PDF, MP4), verify acceptance
- **Type**: e2e
- **Source**: FR-1 Validation on attach

### AC-008: File Hashing - SHA-256 Computation
- **Description**: On file selection, SHA-256 hash computed using streaming (before send).
- **Verification**:
  1. Attach known test file with predetermined hash
  2. Query `media_blobs` table after selection
  3. Verify hash matches expected value (`sha256sum testfile.png`)
- **Type**: integration
- **Source**: FR-2 compute SHA-256 content hash

### AC-009: File Hashing - Local Blob Storage
- **Description**: Raw binary stored in `{userData}/blobs/<hash>` keyed by SHA-256 hash.
- **Verification**:
  1. Attach test file
  2. Query `media_blobs` table for hash and local_path
  3. Verify file exists at `{userData}/blobs/<hash>`
  4. Verify file content matches original (hash comparison)
- **Type**: integration
- **Source**: FR-2 Store raw binary in local blob storage

### AC-010: File Hashing - Metadata Generation
- **Description**: Metadata generated includes MIME type, size, dimensions (images), blurhash (images only).
- **Verification**:
  1. Attach image file with known dimensions
  2. Query `media_blobs` table
  3. Verify `mime_type`, `size_bytes`, `dimensions_json` contain correct values
  4. Verify `blurhash` field populated for image, null for non-image
- **Type**: integration
- **Source**: FR-2 Generate metadata; Implementation Clarifications - Blurhash

### AC-011: File Hashing - Deduplication
- **Description**: Attaching identical file (same hash) reuses existing blob storage.
- **Verification**:
  1. Attach file A, note blob count
  2. Attach same file A again in different message
  3. Verify `media_blobs` table has only one entry for that hash
  4. Verify both messages reference same blob via `message_media` junction table
- **Type**: integration
- **Source**: FR-2 keyed by hash (deduplication by default)

### AC-012: Message Construction - Placeholder Format
- **Description**: Outgoing event contains `local-blob:<sha256>` placeholder in `imeta` tag URL before upload.
- **Verification**:
  1. Attach file, send message while offline (disconnect relay)
  2. Query `nostr_messages` table for queued message
  3. Parse `media_json` column, verify `imeta` tag contains `url local-blob:<sha256>`
- **Type**: integration
- **Source**: FR-3 `local-blob:<sha256>` placeholder

### AC-013: Message Construction - Event Tag Schema (NIP-94)
- **Description**: Each attachment produces `imeta` tag with: url, m (MIME), size, dim (if image), blurhash (if image), sha256.
- **Verification**:
  1. Attach image with known metadata
  2. Query queued message `media_json`
  3. Verify `imeta` tag contains all required fields: `url`, `m`, `size`, `dim`, `blurhash`, `sha256`
  4. Verify values match blob metadata
- **Type**: integration
- **Source**: FR-3 Event tag schema (NIP-94 / NIP-92 compatibility)

### AC-014: Message Construction - Multiple Attachments Ordering
- **Description**: Attachment order preserved as selected; each produces own `imeta` tag in selection order.
- **Verification**:
  1. Attach 3 files (A, B, C) in sequence
  2. Query queued message `media_json`
  3. Verify 3 `imeta` tags present in order A, B, C (match by hash or file name in metadata)
- **Type**: integration
- **Source**: FR-3 Multiple attachments and ordering

### AC-015: Message Construction - Encryption Boundary
- **Description**: Placeholders replaced before encryption; only fully resolved URLs encrypted and published.
- **Verification**:
  1. Send message with attachment while online (relay connected)
  2. Wait for upload completion
  3. Use relay inspector to capture published NIP-17/59 event
  4. Decrypt event content, verify `imeta` URL is real remote URL (not `local-blob:`)
  5. Verify no `local-blob:` appears anywhere in published event
- **Type**: integration
- **Source**: FR-3 Encryption boundary; Critical Constraints - placeholders never published

### AC-016: Upload Pipeline - Online Upload Timing
- **Description**: If online, upload begins immediately after Send click (not at selection).
- **Verification**:
  1. Ensure relay connected and Blossom server reachable
  2. Attach file (verify no upload starts)
  3. Click Send
  4. Monitor upload progress (IPC messages or DB status)
  5. Verify upload started within 1 second of Send click
- **Type**: e2e
- **Source**: FR-4 Upload timing - If online, begin upload immediately after Send

### AC-017: Upload Pipeline - Offline Queue and Deferred Upload
- **Description**: If offline, message queues; upload starts when connectivity restored.
- **Verification**:
  1. Disconnect relay and Blossom server (block network)
  2. Attach file, send message
  3. Verify message status `queued`, no upload attempt
  4. Restore network connectivity
  5. Verify upload starts automatically
  6. Verify message published after upload completes
- **Type**: e2e
- **Source**: FR-4 Upload timing - If offline, queue and upload when connectivity restored

### AC-018: Upload Pipeline - BUD-06 Upload with NIP-98 Auth
- **Description**: Blob uploaded via HTTP PUT to Blossom server with NIP-98 Authorization header (kind 27235 event).
- **Verification**:
  1. Run local Blossom server with request logging
  2. Attach and send file
  3. Inspect Blossom server logs for PUT request
  4. Verify Authorization header present
  5. Parse header, verify Nostr event kind 27235 with correct method, URL, body hash
  6. Verify event signed by active identity
- **Type**: integration
- **Source**: FR-4 Upload using BUD-06 HTTP PUT with NIP-98 auth; FR-9 NIP-98 Authentication

### AC-019: Upload Pipeline - URL Replacement After Upload
- **Description**: On successful upload, `local-blob:<sha256>` replaced with real URL from server response in queued event.
- **Verification**:
  1. Send message with attachment
  2. Wait for upload completion
  3. Query `message_media` table for `remote_url` field
  4. Query `nostr_messages.media_json`, verify `imeta` URL updated to remote URL
  5. Verify placeholder no longer present
- **Type**: integration
- **Source**: FR-4 Replace placeholder with real URL

### AC-020: Upload Pipeline - Publish After Upload
- **Description**: Message published to relay only after all attachments uploaded successfully.
- **Verification**:
  1. Attach 2 files, send message
  2. Monitor upload progress and message status
  3. Verify message remains `queued` or `uploading` until both blobs uploaded
  4. Verify message status transitions to `sent` only after both uploads complete
  5. Use relay inspector to confirm event published only after uploads
- **Type**: e2e
- **Source**: FR-4 Partial failure handling - message not published until all attachments uploaded

### AC-021: Upload Pipeline - Retry on Failure
- **Description**: Upload failures trigger exponential backoff retry (1s, 2s, 4s, 8s, 30s max, 5 attempts max), then permanent error with retry button.
- **Verification**:
  1. Configure Blossom server to reject uploads (503 or timeout)
  2. Attach and send file
  3. Monitor retry timing in logs/DB
  4. Verify delays match: 1s, 2s, 4s, 8s, 30s
  5. After 5 attempts, verify message status `error` with retry button in UI
- **Type**: integration
- **Source**: FR-4 Retry with exponential backoff; Implementation Clarifications - Retry Policy

### AC-022: Upload Pipeline - Partial Failure Handling
- **Description**: If any attachment fails, message remains in error with per-attachment failure details; retrying retries only failed attachments.
- **Verification**:
  1. Attach 2 files, configure server to accept first, reject second
  2. Send message
  3. Verify message status `error` after first upload succeeds but second fails
  4. Query `message_media` for both attachments, verify one shows success, one shows error
  5. Click retry button
  6. Verify only failed attachment retried (server logs show single upload, not both)
- **Type**: integration
- **Source**: FR-4 Partial failure handling

### AC-023: Upload Pipeline - Concurrency Limit
- **Description**: Maximum 2 concurrent blob uploads per identity; additional uploads queue.
- **Verification**:
  1. Send 4 messages with attachments simultaneously (same identity)
  2. Monitor active uploads via IPC progress or server logs
  3. Verify at most 2 uploads active at any time
  4. Verify remaining uploads queue and start as slots free
- **Type**: integration
- **Source**: FR-4 Concurrency; Implementation Clarifications - Upload Concurrency

### AC-024: Blossom Server Config - Per-Identity Server List
- **Description**: Each identity has configurable Blossom server list (URL + optional label); persists across restarts.
- **Verification**:
  1. Open identity settings for Identity A
  2. Add Blossom server URL with label
  3. Restart application
  4. Verify server list persists for Identity A
  5. Switch to Identity B, verify separate empty server list (no shared config)
- **Type**: e2e
- **Source**: FR-5 Per-identity Blossom server list; Acceptance Criteria - server config persists

### AC-025: Blossom Server Config - Add/Remove/Reorder Servers
- **Description**: UI allows adding, removing, and reordering servers in identity settings.
- **Verification**:
  1. Add 3 servers to identity
  2. Reorder via drag-and-drop or buttons
  3. Verify order persisted in DB
  4. Remove middle server, verify only 2 remain
- **Type**: e2e
- **Source**: FR-5 Add, remove, and reorder servers

### AC-026: Blossom Server Config - Health Check Before Upload
- **Description**: HEAD request to server base URL before upload; timeout after 3s; fallback to next server on failure.
- **Verification**:
  1. Configure 2 servers: first unreachable (timeout), second reachable
  2. Send message with attachment
  3. Monitor network logs for HEAD request to first server
  4. Verify timeout after ~3s
  5. Verify fallback to second server for upload
- **Type**: integration
- **Source**: FR-5 Server health check; Health check details

### AC-027: Blossom Server Config - No Default Server
- **Description**: No hardcoded default server; user must configure manually with clear prompts if none configured.
- **Verification**:
  1. Create new identity with no server configured
  2. Attempt to attach file
  3. Verify clear prompt/error indicating server configuration required
  4. Verify no automatic fallback to hardcoded server
- **Type**: e2e
- **Source**: Implementation Clarifications - Blossom Server Configuration

### AC-028: Media Rendering - Outgoing Pending Upload Progress
- **Description**: Outgoing message shows local preview from blob storage with upload progress bar; status transitions: queued → uploading → sending → sent → error.
- **Verification**:
  1. Send message with large attachment (slow upload)
  2. Verify message bubble shows local preview (not broken image)
  3. Verify progress bar overlay appears during upload
  4. Verify status icon transitions: clock → progress → spinner → checkmark
  5. Screenshot each state for visual verification
- **Type**: e2e
- **Source**: FR-6 Outgoing messages (pending upload)

### AC-029: Media Rendering - Outgoing Error State with Retry
- **Description**: Failed upload shows error status with retry button on message bubble.
- **Verification**:
  1. Configure server to reject uploads
  2. Send message with attachment, wait for failure
  3. Verify error icon displayed on message bubble
  4. Verify retry button present
  5. Fix server, click retry, verify upload succeeds
- **Type**: e2e
- **Source**: FR-6 On error, retry button appears

### AC-030: Media Rendering - Outgoing Sent State
- **Description**: Successfully sent messages show inline image thumbnail (click to expand) or download link (non-images).
- **Verification**:
  1. Send message with image attachment (online)
  2. Wait for sent confirmation
  3. Verify inline thumbnail displayed in message bubble
  4. Click thumbnail, verify lightbox/overlay opens with full image
  5. Send message with PDF attachment, verify download link with name, size, icon
- **Type**: e2e
- **Source**: FR-6 Outgoing messages (sent)

### AC-031: Media Rendering - Incoming Media Fetch and Cache
- **Description**: Incoming messages fetch media from URL in event tags, cache locally using existing image cache.
- **Verification**:
  1. Use dual-instance environment: Instance A sends message with image to Instance B
  2. On Instance B, verify incoming message appears
  3. Monitor network requests for media URL fetch
  4. Verify media cached in URL-keyed image cache (not blob storage)
  5. Disconnect network, reload message, verify media loads from cache
- **Type**: e2e
- **Source**: FR-6 Incoming messages; Implementation Clarifications - Media Cache Strategy

### AC-032: Media Rendering - Incoming Blurhash Placeholder
- **Description**: Blurhash placeholder shown while media loads or when offline.
- **Verification**:
  1. Receive message with image (includes blurhash in `imeta`)
  2. Throttle network to simulate slow load
  3. Verify blurhash canvas/placeholder displayed immediately
  4. After load completes, verify real image replaces placeholder
  5. Go offline, reload message, verify blurhash displays (no broken image)
- **Type**: e2e
- **Source**: FR-6 Blurhash placeholder shown while media loads

### AC-033: Local Blob Storage - Storage Location
- **Description**: Blobs stored in `{userData}/blobs/` directory, files named by SHA-256 hash.
- **Verification**:
  1. Attach file, note hash from `media_blobs` table
  2. Navigate to `{userData}/blobs/` directory
  3. Verify file exists with hash as filename (no extension)
  4. Verify file content matches original (hash verification)
- **Type**: integration
- **Source**: FR-7 Location: `{userData}/blobs/`

### AC-034: Local Blob Storage - Cleanup After Upload
- **Description**: Local blob removed after successful upload + 7-day retention grace period (configurable).
- **Verification**:
  1. Send message with attachment, wait for upload completion
  2. Verify blob still present in `{userData}/blobs/` immediately after upload
  3. Fast-forward system time by 7 days (or trigger cleanup manually)
  4. Run cleanup process
  5. Verify blob removed from disk and `media_blobs` table
- **Type**: integration
- **Source**: FR-7 Cleanup policy; Acceptance Criteria - blob cleanup after retention period

### AC-035: Local Blob Storage - Storage Quota and LRU Eviction
- **Description**: Max total blob storage 500 MB (configurable); LRU eviction of uploaded blobs when quota exceeded.
- **Verification**:
  1. Configure quota to 10 MB (low for testing)
  2. Upload 15 MB worth of attachments (all successfully uploaded)
  3. Verify oldest uploaded blobs evicted to maintain 10 MB limit
  4. Verify unuploaded (queued) blobs never evicted
- **Type**: integration
- **Source**: FR-7 Storage quota, LRU eviction; Acceptance Criteria - storage quota enforced

### AC-036: Database Schema - media_blobs Table
- **Description**: `media_blobs` table exists with correct schema: hash (PK), mime_type, size_bytes, dimensions_json, blurhash, local_path, uploaded_at, created_at.
- **Verification**:
  1. Run migration `20260213_add_media_support.ts`
  2. Query database schema for `media_blobs` table
  3. Verify all columns present with correct types
  4. Verify hash is PRIMARY KEY
- **Type**: unit
- **Source**: FR-8 `media_blobs` table; Implementation Clarifications - Migration file

### AC-037: Database Schema - message_media Junction Table
- **Description**: `message_media` junction table exists: message_id (FK), blob_hash (FK), remote_url, placeholder_key, upload_status; indexed on upload_status.
- **Verification**:
  1. Run migration `20260213_add_media_support.ts`
  2. Query schema for `message_media` table
  3. Verify columns and foreign key constraints (message_id → nostr_messages, blob_hash → media_blobs)
  4. Verify index on `upload_status`
- **Type**: unit
- **Source**: FR-8 `message_media` junction table, index

### AC-038: Database Schema - media_json Column
- **Description**: `nostr_messages` table has `media_json` column to store attachment metadata.
- **Verification**:
  1. Run migration
  2. Query `nostr_messages` schema
  3. Verify `media_json` column exists (type JSON or TEXT)
- **Type**: unit
- **Source**: Implementation Clarifications - Database Schema Integration

### AC-039: NIP-98 Authentication - Token Generation
- **Description**: HTTP Authorization header contains signed Nostr event kind 27235 with method, URL, body hash; signed by active identity.
- **Verification**:
  1. Mock Blossom upload, capture Authorization header
  2. Parse header, decode base64 Nostr event
  3. Verify event kind = 27235
  4. Verify tags contain HTTP method, URL, SHA-256 of body
  5. Verify signature validates with active identity pubkey
- **Type**: integration
- **Source**: FR-9 NIP-98 Authentication

### AC-040: NIP-98 Authentication - Short-Lived Token
- **Description**: NIP-98 token validity window is 60 seconds; tokens generated per-request (not cached).
- **Verification**:
  1. Send 2 messages with attachments sequentially
  2. Capture Authorization headers for both uploads
  3. Verify different `created_at` timestamps (tokens not reused)
  4. Verify timestamp within 60s of upload time
- **Type**: integration
- **Source**: FR-9 Token validity window; Critical Constraints - tokens per-request

### AC-041: Security - EXIF Stripping for Images
- **Description**: EXIF data stripped by default from images; failure aborts at file selection with error toast.
- **Verification**:
  1. Create test JPEG with embedded EXIF (GPS coordinates)
  2. Attach file
  3. Verify file in blob storage has no EXIF (use `exiftool` to verify)
  4. Create corrupted JPEG where EXIF stripping fails
  5. Attempt attach, verify error toast and attachment rejected
- **Type**: integration
- **Source**: Security Considerations - EXIF stripping; Implementation Clarifications - EXIF failure

### AC-042: Security - Blossom TLS Required
- **Description**: Blossom server connections require HTTPS; no HTTP fallback.
- **Verification**:
  1. Configure server with `http://` URL
  2. Attempt upload
  3. Verify connection rejected with clear error (TLS required)
- **Type**: integration
- **Source**: Security Considerations - Blossom server TLS required

### AC-043: Error Handling - Server-Side Rejection Messages
- **Description**: Server rejection (size/type) produces clear UI error message specifying reason.
- **Verification**:
  1. Configure Blossom server to reject file type (return 415)
  2. Send message with attachment
  3. Verify error message contains "Server rejected file type" or similar
  4. Configure server to reject size (return 413)
  5. Verify error message contains "File too large for server" or similar
- **Type**: e2e
- **Source**: Error Handling - Server-side size/type rejection

### AC-044: Error Handling - Resume After App Restart
- **Description**: If app closes mid-upload, queued state and blobs persist; upload resumes on restart.
- **Verification**:
  1. Start upload for large file (slow)
  2. Kill app process during upload
  3. Restart app
  4. Verify message still in queue with attachment
  5. Verify upload resumes automatically
- **Type**: e2e
- **Source**: Error Handling - app closes mid-upload

### AC-045: Error Handling - Cancel In-Progress Upload
- **Description**: User can cancel in-progress upload; canceled uploads revert to `queued` and can be retried.
- **Verification**:
  1. Start upload for large file
  2. Click cancel button during upload
  3. Verify upload aborted (network activity stops)
  4. Verify message status reverts to `queued`
  5. Click retry, verify upload restarts
- **Type**: e2e
- **Source**: Error Handling - cancel in-progress upload

### AC-046: Storage Cleanup - Multi-Identity Blob Retention
- **Description**: If same blob attached across multiple identities, retain until all referencing messages sent or expired.
- **Verification**:
  1. Attach same file in message from Identity A
  2. Attach same file (same hash) in message from Identity B
  3. Send and upload message from Identity A
  4. Trigger cleanup after retention period
  5. Verify blob NOT deleted (Identity B message still pending)
  6. Send message from Identity B
  7. Trigger cleanup, verify blob now deleted
- **Type**: integration
- **Source**: Storage and Cleanup Clarifications - retain until all references resolved

### AC-047: Non-Functional - UI Thread Non-Blocking
- **Description**: Upload, hashing, and I/O do not block UI thread; all heavy operations on main process with IPC progress updates.
- **Verification**:
  1. Attach very large file (100 MB if quota permits)
  2. During hashing and upload, verify UI remains responsive (interact with conversation, type messages)
  3. Verify no UI freezes or jank (use performance profiler)
- **Type**: manual
- **Source**: Non-Functional Requirements - upload must not block UI

### AC-048: Non-Functional - Streaming SHA-256 Hashing
- **Description**: Blob hashing uses streaming SHA-256 with no full-file buffering.
- **Verification**:
  1. Hash large file (>100 MB)
  2. Monitor main process memory usage during hashing
  3. Verify memory does not spike by file size (streaming implementation)
- **Type**: integration
- **Source**: Non-Functional Requirements - streaming SHA-256

### AC-049: Non-Functional - Progress Reporting via IPC
- **Description**: Upload progress exposed to renderer via IPC for per-message progress bars.
- **Verification**:
  1. Monitor IPC messages during upload (`nostling:media:upload-progress`)
  2. Verify progress updates sent periodically (e.g., every 5% or 1 second)
  3. Verify renderer updates progress bar based on IPC messages
- **Type**: integration
- **Source**: Non-Functional Requirements - upload progress exposed; Implementation Clarifications - IPC Channels

### AC-050: NIP Compatibility - Incoming Legacy NIP-92 Tags
- **Description**: Renderer accepts both NIP-94 `imeta` tags and legacy NIP-92 `url` tags for received messages.
- **Verification**:
  1. Inject test message with NIP-92 `url` tag (no `imeta`)
  2. Verify media renders correctly in conversation
  3. Inject test message with NIP-94 `imeta` tag
  4. Verify media renders correctly
  5. Inject message with both formats, verify graceful handling
- **Type**: integration
- **Source**: Implementation Clarifications - NIP Compatibility (incoming)

### AC-051: Critical Constraint - No Placeholder Leakage to Relay
- **Description**: Publish step validates all placeholders resolved; messages with unresolved placeholders never published.
- **Verification**:
  1. Mock upload to fail indefinitely (server unreachable)
  2. Send message with attachment
  3. Monitor relay traffic (use relay inspector or proxy)
  4. Verify NO event published to relay containing `local-blob:`
  5. Verify message remains in `queued` or `error` state
- **Type**: integration
- **Source**: Critical Constraints - placeholders must never be published; Acceptance Criteria - placeholders never in published events

### AC-052: Critical Constraint - Queue Extension Not Replacement
- **Description**: Existing message queue flush logic extended (not replaced) to handle media-bearing messages.
- **Verification**:
  1. Send text-only message while offline
  2. Send message with attachment while offline
  3. Restore connectivity
  4. Verify both messages processed by queue
  5. Verify text message published immediately
  6. Verify media message published after upload completes
  7. Code review: verify existing queue logic reused/extended
- **Type**: integration
- **Source**: Critical Constraints - extend queue logic, not replace

## Verification Plan

### Automated Tests

**Unit Tests (6 criteria):**
- AC-036: Database schema - `media_blobs` table
- AC-037: Database schema - `message_media` junction table
- AC-038: Database schema - `media_json` column

**Integration Tests (24 criteria):**
- AC-008: SHA-256 computation
- AC-009: Local blob storage
- AC-010: Metadata generation (MIME, size, dimensions, blurhash)
- AC-011: Blob deduplication
- AC-012: Placeholder format in queued messages
- AC-013: NIP-94 `imeta` tag schema
- AC-014: Multiple attachments ordering
- AC-015: Encryption boundary (no placeholders in published events)
- AC-018: BUD-06 upload with NIP-98 auth
- AC-019: URL replacement after upload
- AC-021: Retry with exponential backoff
- AC-022: Partial failure handling
- AC-023: Upload concurrency limit
- AC-026: Blossom server health check and fallback
- AC-033: Storage location verification
- AC-034: Blob cleanup after retention period
- AC-035: Storage quota and LRU eviction
- AC-039: NIP-98 token generation
- AC-040: NIP-98 token short-lived and per-request
- AC-041: EXIF stripping
- AC-042: Blossom TLS requirement
- AC-046: Multi-identity blob retention
- AC-048: Streaming SHA-256 hashing
- AC-049: IPC progress reporting
- AC-050: NIP compatibility (incoming NIP-92 and NIP-94)
- AC-051: No placeholder leakage to relay
- AC-052: Queue extension not replacement

**E2E Tests (19 criteria) - Dual-Instance Environment:**
- AC-001: Attachment button workflow
- AC-002: Drag and drop
- AC-003: Preview strip display
- AC-004: Multiple attachments
- AC-005: Send with caption
- AC-006: File size validation rejection
- AC-007: MIME type validation rejection
- AC-016: Online upload timing
- AC-017: Offline queue and deferred upload
- AC-020: Publish after upload
- AC-024: Per-identity server configuration persistence
- AC-025: Add/remove/reorder servers UI
- AC-027: No default server prompt
- AC-028: Outgoing pending upload progress UI
- AC-029: Outgoing error state with retry button
- AC-030: Outgoing sent state rendering
- AC-031: Incoming media fetch and cache
- AC-032: Incoming blurhash placeholder
- AC-043: Server rejection error messages
- AC-044: Resume after app restart
- AC-045: Cancel in-progress upload

**Manual Verification (1 criterion):**
- AC-047: UI thread non-blocking (requires human observation of UI responsiveness)

### Test Environment Setup

**Local Blossom Server:**
- Run local BUD-06 compliant server for upload testing
- Configure request logging to verify NIP-98 auth headers
- Support simulated failures (timeouts, rejections) for error path testing

**Dual-Instance Environment:**
- `make dev-dual` starts two Nostling instances with Playwright CDP control
- Playwright-a controls Instance A (sender)
- Playwright-b controls Instance B (receiver)
- Shared local relay for event propagation
- Use `browser_take_screenshot` and `browser_evaluate` for verification (avoid `browser_snapshot` due to Chakra UI compatibility)

**Test Data:**
- Known test files with predetermined hashes (image, PDF, video, audio)
- Large files for performance testing (>25 MB for rejection, ~100 MB for streaming)
- Files with EXIF data for stripping verification
- Unsupported file types for validation testing

### Coverage Matrix

| Spec Requirement | Acceptance Criteria |
|------------------|---------------------|
| FR-1: Attachment UI Workflow | AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007 |
| FR-2: File Hashing and Local Persistence | AC-008, AC-009, AC-010, AC-011 |
| FR-3: Message Construction with Placeholders | AC-012, AC-013, AC-014, AC-015 |
| FR-4: Upload and Publish Pipeline | AC-016, AC-017, AC-018, AC-019, AC-020, AC-021, AC-022, AC-023 |
| FR-5: Blossom Server Configuration | AC-024, AC-025, AC-026, AC-027 |
| FR-6: Media Rendering in Conversation | AC-028, AC-029, AC-030, AC-031, AC-032 |
| FR-7: Local Blob Storage | AC-033, AC-034, AC-035 |
| FR-8: Database Schema Additions | AC-036, AC-037, AC-038 |
| FR-9: NIP-98 Authentication | AC-039, AC-040 |
| Non-Functional Requirements | AC-047, AC-048, AC-049 |
| Critical Constraints | AC-051, AC-052 |
| Security Considerations | AC-041, AC-042 |
| Error Handling and Edge Cases | AC-043, AC-044, AC-045 |
| Storage and Cleanup Clarifications | AC-046 |
| Implementation Clarifications (NIP Compatibility) | AC-050 |

### Test Execution Strategy

1. **Phase 1: Foundation (Unit + Integration)**
   - Database schema tests (AC-036, AC-037, AC-038)
   - File hashing and storage (AC-008, AC-009, AC-010, AC-011)
   - NIP-98 auth generation (AC-039, AC-040)

2. **Phase 2: Core Pipeline (Integration)**
   - Message construction with placeholders (AC-012, AC-013, AC-014)
   - Upload pipeline (AC-018, AC-019, AC-021, AC-022, AC-023)
   - Encryption boundary validation (AC-015)

3. **Phase 3: UI and UX (E2E)**
   - Attachment UI workflows (AC-001 through AC-007)
   - Media rendering states (AC-028, AC-029, AC-030, AC-031, AC-032)
   - Server configuration UI (AC-024, AC-025, AC-027)

4. **Phase 4: Edge Cases and Resilience (Integration + E2E)**
   - Error handling (AC-043, AC-044, AC-045)
   - Storage cleanup and quotas (AC-034, AC-035, AC-046)
   - Security validations (AC-041, AC-042)

5. **Phase 5: Critical Constraints (Integration)**
   - No placeholder leakage (AC-051)
   - Queue extension compatibility (AC-052)

### Success Criteria

All 52 acceptance criteria must pass. Critical constraints (AC-051, AC-052) are mandatory for epic completion and block any release containing this feature.
