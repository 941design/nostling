# Acceptance Criteria: Incoming Image Message Rendering

Generated: 2026-02-20T20:00:00Z
Source: spec.md

## Overview

These criteria verify that Nostling can receive and visually render image content from incoming NIP-17 messages regardless of how the sending client structured the media reference (kind 14 with URL in content, kind 14 with imeta tags, or kind 15 file messages). Includes graceful degradation for unknown formats and missing metadata.

## Criteria

### AC-001: Kind-15 file message renders image inline
- **Description**: When a NIP-17 kind-15 file message containing an image URL is received, `decryptNip17Message()` returns the kind-15 rumor (not null), `ingestIncomingMessage()` builds `mediaJson` from kind-15 tags, and `MediaAttachments` component renders the image inline in the chat conversation.
- **Verification**: Dual-instance test: Instance A sends kind-15 file message (constructed via relay injection), Instance B receives and displays image. Verify via screenshot that image is visible in chat.
- **Type**: e2e
- **Source**: FR-1 (Accept NIP-17 Kind 15 File Messages), AC line 152

### AC-002: Kind-14 message with image URL in text renders inline
- **Description**: When a NIP-17 kind-14 chat message contains a blossom image URL in its text content (without imeta tags), `MessageContent` detects the image URL pattern and renders the image inline, replacing or supplementing the URL text.
- **Verification**: Dual-instance test: Instance A sends kind-14 message with image URL in content field, Instance B receives and displays image inline. Verify via screenshot that image is rendered, not just URL text.
- **Type**: e2e
- **Source**: FR-2 (Inline Image Detection in Message Text Content), AC line 153

### AC-003: Kind-14 imeta without MIME infers from URL extension
- **Description**: When a NIP-17 kind-14 chat message has imeta tags but the `m` (MIME type) field is missing, `parseImetaTags()` infers MIME from URL extension (e.g., `.jpg` → `image/jpeg`), `isImageMimeType()` returns true, and `MediaAttachments` renders the image correctly.
- **Verification**: Unit test: `parseImetaTags([['imeta', 'url https://example.com/blob/abc123.jpg']])` returns attachment with `mimeType: 'image/jpeg'`. E2E: Send message with imeta lacking `m` field, verify image renders.
- **Type**: integration
- **Source**: FR-3 (MIME Type Inference from URL and Tags), AC line 154

### AC-004: AVIF image renders inline
- **Description**: When an incoming message contains `image/avif` content (via imeta `m` field or inferred from `.avif` extension), `isImageMimeType('image/avif')` returns true, and `CachedImage` renders the AVIF image inline (Chromium native support).
- **Verification**: E2E: Send message with AVIF image URL, verify image renders. Unit test: `isImageMimeType('image/avif') === true`.
- **Type**: integration
- **Source**: FR-4 (Extended Incoming Image Format Support), AC line 155

### AC-005: BMP image renders inline
- **Description**: When an incoming message contains `image/bmp` content, `isImageMimeType('image/bmp')` returns true, and `CachedImage` renders the BMP image inline (Chromium native support).
- **Verification**: E2E: Send message with BMP image URL, verify image renders. Unit test: `isImageMimeType('image/bmp') === true`.
- **Type**: integration
- **Source**: FR-4 (Extended Incoming Image Format Support), AC line 155

### AC-006: SVG image renders inline (script-safe)
- **Description**: When an incoming message contains `image/svg+xml` content, `isImageMimeType('image/svg+xml')` returns true, `CachedImage` renders the SVG inline using `<img>` tag (which disables scripts for security), and no JavaScript execution occurs from SVG content.
- **Verification**: E2E: Send message with SVG image URL (including one with embedded `<script>` tag), verify image renders without script execution. Manual: Inspect rendered element is `<img>`, not `<iframe>` or dangerouslySetInnerHTML.
- **Type**: integration
- **Source**: FR-4 (Extended Incoming Image Format Support), AC line 155; Security Considerations

### AC-007: HEIC image shows download link
- **Description**: When an incoming message contains `image/heic` content (not natively supported by Chromium), `isImageMimeType('image/heic')` returns true but `isRenderableImageMimeType('image/heic')` returns false, and `MediaAttachments` renders a file download link with appropriate icon instead of attempting inline rendering.
- **Verification**: E2E: Send message with HEIC image URL, verify download link appears (not broken image). Unit test: `isImageMimeType('image/heic') === true`, `isRenderableImageMimeType('image/heic') === false`.
- **Type**: integration
- **Source**: FR-4 (Extended Incoming Image Format Support), AC line 156

### AC-008: TIFF image shows download link
- **Description**: When an incoming message contains `image/tiff` content (not natively supported by Chromium), `isImageMimeType('image/tiff')` returns true but `isRenderableImageMimeType('image/tiff')` returns false, and `MediaAttachments` renders a file download link instead of attempting inline rendering.
- **Verification**: E2E: Send message with TIFF image URL, verify download link appears (not broken image). Unit test: `isImageMimeType('image/tiff') === true`, `isRenderableImageMimeType('image/tiff') === false`.
- **Type**: integration
- **Source**: FR-4 (Extended Incoming Image Format Support), AC line 156

### AC-009: Unrecognized wrapped event kind logged and discarded
- **Description**: When an incoming wrapped event has an unrecognized kind (e.g., kind 42 for community posts), `processGiftWrapEvent` logs the kind number at info level, discards the event gracefully, and does NOT show any error to the user or cause UI glitches.
- **Verification**: Unit test: Call `processGiftWrapEvent` with kind-42 rumor, verify no database insertion and info-level log emitted. E2E: Inject kind-42 wrapped event via relay, verify no error toast or console error.
- **Type**: integration
- **Source**: FR-6 (Graceful Handling of Unknown Wrapped Event Kinds), AC line 157

### AC-010: Existing kind-14 text-only messages unchanged
- **Description**: After implementing kind-15 and inline image detection, kind-14 text-only messages (no imeta, no image URLs in content) render exactly as before, with no visual or functional regression.
- **Verification**: E2E: Send kind-14 text-only message, verify rendering matches pre-implementation baseline screenshot. Manual visual regression test on existing conversations.
- **Type**: e2e
- **Source**: Critical Constraints, AC line 158

### AC-011: Existing kind-14 imeta messages unchanged
- **Description**: After implementing kind-15 and inline image detection, kind-14 messages with imeta tags render exactly as before, with no visual or functional regression.
- **Verification**: E2E: Send kind-14 message with imeta tags, verify rendering matches pre-implementation baseline screenshot.
- **Type**: e2e
- **Source**: Critical Constraints, AC line 158

### AC-012: No changes to outgoing message format
- **Description**: After implementation, `sendMessage()` continues to send kind-14 messages with `imeta` tags in the exact same format as before. Kind-15 is receive-only; no outgoing kind-15 messages are sent.
- **Verification**: E2E: Send message with image attachment, inspect event on relay (via relay subscription or debug log), verify kind is 14 and imeta tags are present. Unit test: Verify `sendMessage` logic unchanged.
- **Type**: integration
- **Source**: Critical Constraints, AC line 159

### AC-013: No double-rendering when structured attachments exist
- **Description**: When a message has both `mediaJson` with parsed attachments AND image URLs in the text content, inline image detection is skipped (or deduplicated) to prevent rendering the same image twice.
- **Verification**: E2E: Send kind-14 message with imeta tag AND the same image URL in content text, verify image appears exactly once. Unit test: Verify `MessageContent` checks for `mediaJson` presence before applying inline detection.
- **Type**: integration
- **Source**: FR-2 (Inline Image Detection in Message Text Content), AC line 160

### AC-014: Inline images use lazy rendering
- **Description**: When a message contains multiple inline images, `MessageContent` renders them using lazy loading (images below viewport load on scroll), measured by network requests only firing when image enters viewport.
- **Verification**: E2E: Send message with 10 inline images, scroll to top of conversation, verify only visible images have network requests. Use browser devtools network tab or `waitForMediaUploadComplete`-style polling to confirm lazy behavior.
- **Type**: integration
- **Source**: Non-Functional Requirements, AC line 161

### AC-015: Failed image loads show placeholder
- **Description**: When an inline image URL returns 404, network error, or unsupported format, `CachedImage` displays a placeholder/broken image indicator instead of a blank space or infinite loading state.
- **Verification**: E2E: Send message with broken image URL (404), verify placeholder appears. Manual: Disconnect network and verify fallback behavior.
- **Type**: integration
- **Source**: FR-2 (Inline Image Detection in Message Text Content), AC line 162

### AC-016: Kind-15 malformed tags use best-effort rendering
- **Description**: When a kind-15 file message has malformed or missing tags (e.g., no `file-type` tag), `ingestIncomingMessage` attempts MIME inference from URL extension, uses defaults for missing optional tags (`dim`, `blurhash`), and stores the message with whatever mediaJson could be constructed, falling back to text-only if URL is invalid.
- **Verification**: Unit test: Call `ingestIncomingMessage` with kind-15 rumor missing `file-type` tag, verify MIME inferred from URL. E2E: Send kind-15 with missing `dim` and `blurhash`, verify image still renders (without dimensions or placeholder).
- **Type**: integration
- **Source**: FR-1 (Accept NIP-17 Kind 15 File Messages), AC line 163

### AC-017: No limit on inline images per message
- **Description**: A message containing an arbitrary number of inline image URLs (e.g., 20 images) renders all of them without truncation or error, relying on lazy loading for performance.
- **Verification**: E2E: Send message with 20 inline image URLs, verify all 20 render when scrolled through. No specific performance threshold, but no crashes or UI freezes.
- **Type**: e2e
- **Source**: FR-2 (Inline Image Detection in Message Text Content), AC line 164

### AC-018: HTTPS-only image URLs rendered
- **Description**: When message content contains image URLs, only `https://` URLs are rendered inline. `http://`, `javascript:`, `data:`, `file://` URLs in message content are rendered as text links, never as images.
- **Verification**: Unit test: `detectImageUrls("http://example.com/image.jpg")` returns empty array. E2E: Send message with http:// image URL, verify rendered as text link, not image.
- **Type**: unit
- **Source**: Security Considerations

### AC-019: Blossom blob URLs without extension render as images
- **Description**: When an incoming message contains a blossom blob URL with no file extension (pattern: `https://<host>/blob/<sha256>`), MIME inference defaults to attempting image rendering via `CachedImage`, which either succeeds (if Content-Type is image) or shows placeholder/broken image (if not).
- **Verification**: E2E: Send message with extensionless blossom URL returning `Content-Type: image/jpeg`, verify image renders. Send extensionless URL returning `Content-Type: text/plain`, verify placeholder appears.
- **Type**: integration
- **Source**: FR-3 (MIME Type Inference from URL and Tags)

### AC-020: MIME inference from Content-Type header
- **Description**: When fetching an image for cache, if the `Content-Type` response header from the blossom server differs from the inferred MIME type, `CachedImage` trusts the Content-Type header and renders (or shows placeholder) accordingly.
- **Verification**: Integration test: Mock image cache to return different Content-Type than URL extension, verify rendering decision uses Content-Type. Unit test: MIME inference logic prioritizes Content-Type over URL extension when both available.
- **Type**: integration
- **Source**: FR-3 (MIME Type Inference from URL and Tags)

### AC-021: MediaJson backward compatibility maintained
- **Description**: After implementation, `parseMediaJson()` continues to correctly parse both outgoing format (`{"attachments": [...]}`) and incoming format (`{"tags": [...]}`) without breaking existing messages in the database.
- **Verification**: Unit test: Parse both formats with `parseMediaJson()`, verify both return expected `ParsedMediaAttachment[]`. E2E: Load conversation with pre-existing messages (both formats), verify all render correctly.
- **Type**: unit
- **Source**: Critical Constraints

### AC-022: Kind-15 tags map to mediaJson structure
- **Description**: When ingesting a kind-15 file message, `ingestIncomingMessage()` constructs `mediaJson` from kind-15 tags: `content` → `url`, `file-type` → `mimeType`, `dim` → `dimensions`, `blurhash` → `blurhash`, `x` → `sha256`. Stored in `{"tags": [...]}` format for consistency.
- **Verification**: Unit test: Call tag-to-mediaJson mapping function with kind-15 tags, verify output structure matches `{"tags": [['imeta', 'url ...', 'm ...', ...]]}`. E2E: Send kind-15, query database, verify `media_json` column has correct structure.
- **Type**: integration
- **Source**: FR-5 (Kind-15 File Message Media JSON Construction)

### AC-023: Kind-15 thumb tag ignored
- **Description**: When a kind-15 file message includes a `thumb` tag (thumbnail URL), the mapping to `mediaJson` ignores it and always uses the full-size URL from `content` field.
- **Verification**: Unit test: Parse kind-15 with `thumb` tag, verify `mediaJson` only contains `content` URL, not thumb URL. E2E: Send kind-15 with thumb tag, verify full-size image is loaded.
- **Type**: unit
- **Source**: FR-5 (Kind-15 File Message Media JSON Construction)

## Verification Plan

### Automated Tests

**Unit tests** (AC-003, AC-004, AC-005, AC-007, AC-008, AC-018, AC-021, AC-022, AC-023):
- MIME type inference from URL extensions (`media-parser.ts`)
- `isImageMimeType()` and `isRenderableImageMimeType()` for extended formats
- HTTPS-only URL filtering
- `parseMediaJson()` backward compatibility
- Kind-15 tag-to-mediaJson mapping
- Thumb tag exclusion logic

**Integration tests** (AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009, AC-013, AC-014, AC-015, AC-016, AC-019, AC-020, AC-022):
- `decryptNip17Message()` accepting kind 14 and 15
- `ingestIncomingMessage()` building mediaJson from kind-15 tags
- `parseImetaTags()` MIME inference
- `processGiftWrapEvent()` logging unrecognized kinds
- Inline image detection skipping when mediaJson present
- Lazy rendering behavior (network request timing)
- Failed image load placeholder
- Kind-15 malformed tag handling
- Content-Type header MIME inference
- MediaJson structure validation

**E2E tests** (AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009, AC-010, AC-011, AC-012, AC-013, AC-014, AC-015, AC-016, AC-017, AC-019, AC-022):
- Dual-instance tests for kind-15 receive and render
- Dual-instance tests for kind-14 with inline URLs
- Extended format rendering (AVIF, BMP, SVG, HEIC, TIFF)
- Unrecognized kind graceful handling
- Regression tests for existing kind-14 messages
- Outgoing message format unchanged
- No double-rendering
- Lazy rendering with multiple images
- No limit on inline images per message

**Manual verification** (AC-006, AC-015):
- SVG rendered via `<img>` tag (inspect DOM)
- Network disconnection fallback behavior

### Test Execution Strategy

1. **Unit tests first**: Validate MIME inference, URL filtering, parsing logic
2. **Integration tests**: Validate component interactions (crypto → service → parser → renderer)
3. **E2E tests**: Validate end-to-end flows in dual-instance environment
4. **Manual tests**: Security (SVG script safety) and edge cases (network failure)

## E2E Test Plan (MANDATORY)

All E2E tests use the dual-instance test environment with Docker Compose infrastructure (strfry relay, blossom server, two Nostling instances) and Playwright browser automation.

### Infrastructure Requirements

**Docker Compose services**:
- `strfry`: Local Nostr relay
- `blossom`: Blossom blob server (or mock server returning blob URLs)
- `nostling-a`: Instance A (CDP port 9222)
- `nostling-b`: Instance B (CDP port 9223)

**Test prerequisites**:
- Both instances have identities created
- Both instances are contacts with each other (NIP-17 DM capability)
- Relay and blossom server are running and accessible
- `playwright-a` controls Instance A, `playwright-b` controls Instance B

### E2E Scenarios

| Scenario | User Steps (Browser) | Expected Outcome | ACs Validated |
|----------|----------------------|------------------|---------------|
| **E2E-01: Receive kind-15 file message** | 1. Instance A: Inject kind-15 wrapped event via relay (or send via dev tool) 2. Instance B: Navigate to chat with Instance A 3. Instance B: Wait for message to appear | Image from kind-15 URL is visible inline in chat conversation | AC-001, AC-022 |
| **E2E-02: Receive kind-14 with inline URL** | 1. Instance A: Send message with text content containing blossom image URL (no imeta) 2. Instance B: Navigate to chat with Instance A 3. Instance B: Wait for message to appear | Image is rendered inline, URL text is replaced/supplemented by image | AC-002 |
| **E2E-03: Receive imeta without MIME** | 1. Instance A: Send kind-14 message with imeta tags lacking `m` field (inject via relay or dev tool) 2. Instance B: Navigate to chat with Instance A 3. Instance B: Wait for message to appear | Image is rendered correctly, MIME inferred from URL extension | AC-003 |
| **E2E-04: Receive AVIF image** | 1. Instance A: Send message with AVIF image URL 2. Instance B: Navigate to chat, wait for message | AVIF image renders inline | AC-004 |
| **E2E-05: Receive BMP image** | 1. Instance A: Send message with BMP image URL 2. Instance B: Navigate to chat, wait for message | BMP image renders inline | AC-005 |
| **E2E-06: Receive SVG image (script-safe)** | 1. Instance A: Send message with SVG URL (including one with embedded `<script>`) 2. Instance B: Navigate to chat, wait for message 3. Inspect DOM element | SVG renders via `<img>` tag, no script execution | AC-006 |
| **E2E-07: Receive HEIC image** | 1. Instance A: Send message with HEIC image URL 2. Instance B: Navigate to chat, wait for message | Download link appears, not broken image | AC-007 |
| **E2E-08: Receive TIFF image** | 1. Instance A: Send message with TIFF image URL 2. Instance B: Navigate to chat, wait for message | Download link appears, not broken image | AC-008 |
| **E2E-09: Receive unrecognized kind** | 1. Inject kind-42 wrapped event via relay 2. Instance B: Navigate to chat | No error toast, no UI glitch, event logged and discarded | AC-009 |
| **E2E-10: Existing kind-14 text-only unchanged** | 1. Instance A: Send kind-14 text-only message 2. Instance B: Navigate to chat, take screenshot | Rendering matches pre-implementation baseline | AC-010 |
| **E2E-11: Existing kind-14 imeta unchanged** | 1. Instance A: Send kind-14 with imeta tags 2. Instance B: Navigate to chat, take screenshot | Rendering matches pre-implementation baseline | AC-011 |
| **E2E-12: Outgoing format unchanged** | 1. Instance A: Send message with image attachment 2. Inspect event on relay (via subscription or debug log) | Event is kind 14 with imeta tags | AC-012 |
| **E2E-13: No double-rendering** | 1. Instance A: Send kind-14 with imeta tag AND same URL in content text 2. Instance B: Navigate to chat | Image appears exactly once | AC-013 |
| **E2E-14: Lazy rendering** | 1. Instance A: Send message with 10 inline images 2. Instance B: Navigate to chat, scroll to top 3. Monitor network requests | Only visible images load initially | AC-014 |
| **E2E-15: Failed image shows placeholder** | 1. Instance A: Send message with broken image URL (404) 2. Instance B: Navigate to chat, wait for message | Placeholder/broken image indicator appears | AC-015 |
| **E2E-16: Kind-15 malformed tags** | 1. Inject kind-15 with missing `file-type` tag via relay 2. Instance B: Navigate to chat | Image renders with MIME inferred from URL | AC-016 |
| **E2E-17: Multiple inline images** | 1. Instance A: Send message with 20 inline image URLs 2. Instance B: Navigate to chat, scroll through entire message | All 20 images render without truncation or crash | AC-017 |
| **E2E-18: Extensionless blossom URL** | 1. Instance A: Send message with blossom URL (no extension) returning `Content-Type: image/jpeg` 2. Instance B: Navigate to chat | Image renders correctly | AC-019 |

### Test Flow Per Scenario

Each scenario follows this pattern:

1. **Docker Compose setup**: Start infrastructure with `make dev-dual` (or test-specific compose file)
2. **Preconditions**:
   - Both instances have identities created via `ensureIdentityExists()` helper
   - Both instances are mutual contacts (if not, establish contact via NIP-17 handshake)
   - Blossom server has test images seeded (or mock server configured)
3. **User steps**: All actions via Playwright UI interactions (click, type, wait)
   - Instance A: Compose and send message (or inject event via relay for kind-15/malformed cases)
   - Instance B: Navigate to chat, wait for message to appear
4. **Assertions**: Playwright verifies observable UI state
   - `browser_take_screenshot`: Visual verification of image rendering
   - `browser_evaluate`: Check DOM for `<img>` tag, src attribute, error state
   - Network tab inspection (for lazy loading tests)
5. **Teardown**: Stop Docker Compose, clean up test data directories

### E2E Coverage Rule

Every AC of type `e2e` or `integration` is covered by at least one E2E scenario. The happy-path E2E scenarios (E2E-01, E2E-02, E2E-03) cover primary user workflows and are MANDATORY.

## Coverage Matrix

| Spec Requirement | Acceptance Criteria |
|------------------|---------------------|
| FR-1: Accept NIP-17 Kind 15 File Messages | AC-001, AC-016, AC-022, AC-023 |
| FR-2: Inline Image Detection in Message Text Content | AC-002, AC-013, AC-014, AC-015, AC-017 |
| FR-3: MIME Type Inference from URL and Tags | AC-003, AC-019, AC-020 |
| FR-4: Extended Incoming Image Format Support | AC-004, AC-005, AC-006, AC-007, AC-008 |
| FR-5: Kind-15 File Message Media JSON Construction | AC-022, AC-023 |
| FR-6: Graceful Handling of Unknown Wrapped Event Kinds | AC-009 |
| NFR: No rendering latency for text-only messages | AC-014 (lazy rendering) |
| NFR: Kind-15 processing must not break existing kind-14 | AC-010, AC-011, AC-021 |
| Constraint: No changes to outgoing message format | AC-012 |
| Constraint: No Content-Type sniffing for security | AC-018 |
| Constraint: MediaJson backward compatibility | AC-021 |
| Security: HTTPS-only image URLs | AC-018 |
| Security: SVG script safety | AC-006 |

All spec requirements have at least one acceptance criterion. No orphan ACs.
