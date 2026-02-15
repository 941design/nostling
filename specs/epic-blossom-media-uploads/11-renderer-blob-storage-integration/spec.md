# Story 11: Renderer Blob Storage Integration

## Problem

The `useAttachments` hook (Story 05) was implemented as a UI stub. It generates thumbnails and browser-side hashes for preview purposes but never calls `window.api.blobStorage.storeBlob()` to persist files to disk or register them in the `media_blobs` table. The paperclip button shows a "Not yet implemented" toast instead of processing selected files.

As a result, when a message with attachments is sent:
1. `message_media` rows are inserted referencing a blob hash
2. But `media_blobs` has no matching row
3. `getPendingUploads()` does `JOIN media_blobs ON mm.blob_hash = mb.hash` — returns 0 rows
4. The upload pipeline silently finds nothing to upload
5. The message is permanently stuck in "sending" with no log output

This story bridges the renderer attachment flow to the main process blob storage service.

## Root Cause

Story 05 (attachment UI) scope included "Integration with blob storage (trigger hash + save)" but its acceptance criteria (AC-001 through AC-007) only covered UI presentation. AC-008/AC-009 (file hashing and blob storage) were assigned to Story 02 and tested `BlobStorageService` in isolation. No acceptance criterion or verification question checked whether the renderer actually calls `storeBlob()` via IPC.

## Scope

### Two broken code paths

**Paperclip button** (`handleAttachClick` → `handleAddFile` in `main.tsx:1058-1097`):
- `showOpenDialog` returns absolute file paths
- `handleAddFile` shows "Not yet implemented" toast and discards the path
- Fix: call `storeBlob(filePath)`, then feed the result into the attachment state

**Drag-and-drop** (`handleDrop` → `useAttachments.addAttachment` in `main.tsx:1099`):
- Receives `File` objects with `.path` property (Electron exposes the native path on dropped files)
- `addAttachment` creates `blob:` URLs and a browser-side hash via `crypto.subtle.digest`
- Fix: call `storeBlob(file.path)`, then use the returned hash/metadata instead of the browser-side values

### What changes

1. **`useAttachments.addAttachment()`** — Replace the browser-side hash generation and `blob:` URL creation with a call to `window.api.blobStorage.storeBlob(filePath)`. Use the returned `{ hash, metadata }` for `AttachmentMetadata`. Keep the thumbnail generation for preview (it's faster than round-tripping to main process).

2. **`handleAddFile(filePath)`** in `main.tsx` — Replace the "Not yet implemented" toast with a call to `addAttachment` using the file path from `showOpenDialog`.

3. **`addAttachment` signature** — Change from `(file: File)` to accept a file path (string). Both code paths (paperclip and drag-and-drop) have access to a file path: `showOpenDialog` returns paths directly, and Electron's drag-and-drop `File` objects have a `.path` property.

### What does NOT change

- `BlobStorageService` (Story 02) — already works
- `enqueueOutgoingMessage` (Story 06) — already inserts `message_media` rows correctly
- Upload pipeline (Story 07) — already uploads when `media_blobs` rows exist
- Preload bridge — `window.api.blobStorage.storeBlob` already exposed
- `AttachmentData` type — already has all needed fields

## Acceptance Criteria

### AC-S11-01: Paperclip button opens file picker and stores selected files
- Click paperclip button, select a file in the native dialog
- File is persisted via `storeBlob()` — verify `media_blobs` row exists with correct hash
- Attachment preview strip appears with thumbnail/icon
- No "Not yet implemented" toast

### AC-S11-02: Drag-and-drop stores dropped files via blob storage
- Drag an image file onto the conversation pane and drop it
- File is persisted via `storeBlob()` — verify `media_blobs` row exists
- Hash in `AttachmentMetadata` matches the hash returned by `BlobStorageService` (content-addressed after EXIF stripping), not a browser-side hash

### AC-S11-03: Send triggers upload pipeline
- Attach a file (via either path), type a caption, click Send
- `message_media` row references a hash that exists in `media_blobs`
- `getPendingUploads()` returns the upload (JOIN succeeds)
- Upload pipeline log output appears (upload attempt or "No healthy Blossom server" warning)

### AC-S11-04: End-to-end UI flow (T11 via UI)
- With a Blossom server configured, attach an image via the UI, send the message
- Upload completes, placeholder is replaced, message status transitions to "sent"
- Recipient instance sees the image
- This is the T11 test scenario executed entirely through UI interactions

## Verification

This story MUST be verified using the dual-instance test environment through UI interactions only, per the test design principles in `docs/dual-instance-playwright-setup.md`. Specifically:

1. Unit tests for the refactored `useAttachments` hook (mock `window.api.blobStorage.storeBlob`)
2. T11 from `docs/dual-instance-testing.md` executed through the UI (not IPC calls)

## Notes

- The `File.path` property is Electron-specific (not standard web API). It provides the absolute path of a dropped file. This is the mechanism that bridges the renderer's `File` object to the main process's file-path-based `storeBlob()`.
- Validation (`validateFile`) should still run before calling `storeBlob()` to avoid unnecessary IPC round-trips for obviously invalid files.
- Thumbnail generation can remain client-side (from the `File` object) for instant preview, while `storeBlob()` runs in parallel for the actual persistence.
