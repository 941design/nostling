---
epic: encrypted-media-blobs
created: 2026-02-20T00:00:00Z
status: draft
---

# Encrypted Media Blobs for Direct Messages

## Problem Statement

Media uploaded to Blossom servers is stored and served in plaintext. The privacy model relies entirely on URL obscurity — the SHA-256 hash in the blob URL is unguessable, but anyone who obtains the URL (including the Blossom server operator) can view the content. This is inconsistent with the end-to-end encryption guarantees of NIP-17/59 messaging: message text is encrypted, but attached images are not.

For a privacy-focused messenger, the server operator and any party who intercepts or discovers a blob URL should not be able to view the media content. Only the conversation participants (who possess the decryption key delivered inside the encrypted NIP-17 envelope) should be able to decrypt and view attached media.

## Core Functionality

Client-side encryption of media blobs before upload to Blossom servers. A random symmetric key is generated per blob, the blob is encrypted locally, and the ciphertext is uploaded. The decryption key is delivered inside the NIP-17/59 encrypted message payload via `imeta` tag extensions, making it accessible only to conversation participants.

## Terminology

- **Plaintext blob**: The original, unprocessed media file (after EXIF stripping).
- **Encrypted blob**: The ciphertext produced by encrypting the plaintext blob with a random symmetric key.
- **Blob key**: A random AES-256-GCM key generated per blob, used for encryption and decryption.
- **Nonce/IV**: A random 12-byte initialization vector for AES-256-GCM, unique per encryption operation.

## Functional Requirements

### FR-1: Blob Encryption Before Upload

Before uploading a blob to a Blossom server, encrypt it using AES-256-GCM:

1. Generate a cryptographically random 256-bit (32-byte) symmetric key
2. Generate a cryptographically random 96-bit (12-byte) nonce
3. Encrypt the plaintext blob (post-EXIF-strip) using AES-256-GCM with the key and nonce
4. Produce the ciphertext output as: `nonce (12 bytes) || ciphertext || auth tag (16 bytes)`
5. Upload the concatenated output to the Blossom server as the blob content

The MIME type sent in the upload `Content-Type` header changes to `application/octet-stream` for encrypted blobs, since the ciphertext is opaque binary data.

### FR-2: Key Delivery via imeta Tags

Include the blob key and encryption metadata in the `imeta` tag inside the encrypted NIP-17 event payload:

- `encryption aes-256-gcm` — signals the blob is encrypted and specifies the algorithm
- `key <hex>` — the 32-byte symmetric key encoded as 64 hex characters
- `nonce <hex>` — the 12-byte nonce encoded as 24 hex characters
- `dim`, `blurhash`, `m`, `size`, `sha256` — continue to describe the **plaintext** media properties (dimensions, blurhash, original MIME type, original size, plaintext content hash)

Because `imeta` tags live inside the kind:14 rumor (which is sealed and gift-wrapped via NIP-59), the key material is only accessible to conversation participants who can decrypt the outer envelope.

Example `imeta` tag for an encrypted image:
```
["imeta",
  "url https://blossom.example.com/blob/<ciphertext-hash>",
  "m image/jpeg",
  "size 245760",
  "dim 1920x1080",
  "blurhash LKO2?U%2Tw=w]~RBVZRi}nMxS#M|",
  "sha256 <plaintext-hash>",
  "encryption aes-256-gcm",
  "key <64-hex-chars>",
  "nonce <24-hex-chars>"
]
```

### FR-3: Decryption on Receive

When rendering an incoming media message:

1. Check the `imeta` tag for the `encryption` field
2. If present, fetch the encrypted blob from the URL
3. Extract the nonce (first 12 bytes), ciphertext (middle), and auth tag (last 16 bytes) from the fetched data
4. Decrypt using AES-256-GCM with the `key` and `nonce` from the `imeta` tag
5. If decryption succeeds, render the plaintext media with the MIME type from the `m` field
6. If decryption or authentication fails, show an error indicator on the media attachment

### FR-4: Backward Compatibility

- **Receiving unencrypted blobs**: If an `imeta` tag lacks the `encryption` field, fetch and render the blob directly (current behavior). This preserves compatibility with messages from other Nostr clients that do not encrypt media.
- **Sending**: All outgoing media in direct messages is encrypted. There is no user-facing toggle — encryption is always on for DMs.
- **Plaintext hash preservation**: The `sha256` field in `imeta` continues to reference the plaintext content hash for integrity verification after decryption, not the ciphertext hash.

### FR-5: Local Blob Storage Adjustments

- Local blob storage (`{userData}/blobs/`) continues to store the **plaintext** blob (post-EXIF-strip, pre-encryption) keyed by plaintext SHA-256 hash. This preserves local deduplication.
- Encryption happens at upload time, not at storage time. The `BlobStorageService` is unaffected.
- The ciphertext is ephemeral — generated in the upload pipeline, sent to the server, and not persisted locally.
- For received encrypted blobs, after decryption the plaintext is cached in the existing image cache (URL-keyed), same as current behavior.

### FR-6: Content Addressing Changes

The Blossom server's content address (URL path) is based on the **ciphertext** hash, since that is what the server stores and serves. This means:

- The `url` field in the `imeta` tag contains the ciphertext-addressed URL
- The `sha256` field contains the **plaintext** hash (for client-side integrity verification after decryption)
- The server's SHA-256 in the upload response corresponds to the ciphertext, not the plaintext
- Server-side deduplication across different conversations will not occur (different random keys produce different ciphertext for the same plaintext). This is a deliberate privacy tradeoff — deduplication would leak information about identical content across conversations.

## Non-Functional Requirements

- Encryption and decryption must not block the UI thread; all crypto operations run in the main process
- AES-256-GCM is hardware-accelerated on modern CPUs via Node.js `crypto` module — no additional dependencies required
- Overhead per blob: 28 bytes (12-byte nonce + 16-byte auth tag) — negligible
- Blurhash previews remain available in the `imeta` tag for immediate placeholder rendering while the encrypted blob is fetched and decrypted

## Critical Constraints

- The blob key MUST only appear inside the NIP-17/59 encrypted envelope. It must never be logged, stored in the database in plaintext, or transmitted outside the encrypted message.
- The nonce MUST be unique per encryption operation. Never reuse a nonce with the same key.
- EXIF stripping continues to happen **before** encryption (on the plaintext), not after.
- The `local-blob:` placeholder constraint from the media uploads spec still applies — placeholders must be resolved before publish.
- The encrypted blob `Content-Type` header MUST be `application/octet-stream` to avoid leaking the original media type to the Blossom server.

## Security Considerations

- **Threat model**: Protects media content from the Blossom server operator, network observers (beyond TLS), and anyone who discovers the blob URL. Does not protect against a compromised recipient device.
- **Algorithm choice**: AES-256-GCM provides authenticated encryption (confidentiality + integrity + authenticity). The auth tag prevents tampering with ciphertext.
- **Key entropy**: Each blob key is independently generated with `crypto.randomBytes(32)` — no key derivation from conversation keys or other deterministic sources.
- **No server-side deduplication**: Intentional. If the same image is sent in two different conversations, two different ciphertexts are uploaded. Server-side deduplication would reveal that two conversations share identical media.
- **Metadata leakage**: The ciphertext size reveals the approximate plaintext size (within 28 bytes). The upload timing and blob count are also observable by the server. These are acceptable given the threat model.
- **Forward secrecy**: Not provided at the blob layer. If a recipient's NIP-17 key is compromised, past blob keys are recoverable from past messages. This matches the forward secrecy properties of NIP-17 itself.

## Affected Components

- `src/main/media/upload-pipeline.ts` — encrypt blob before HTTP PUT; send `application/octet-stream` content type
- `src/main/media/imeta-builder.ts` — add `encryption`, `key`, and `nonce` fields to outgoing `imeta` tags
- `src/main/nostling/service.ts` — no changes expected (encryption is transparent to the message layer)
- `src/main/image-cache/` — decrypt received encrypted blobs before caching
- `src/renderer/components/MediaAttachments/` — handle decryption indicator/error states
- `src/main/blob-storage/BlobStorageService.ts` — no changes (stores plaintext locally)

## Acceptance Criteria

- Outgoing image attachments in DMs are encrypted before upload to Blossom
- Encrypted blob on Blossom server is opaque binary (not viewable as an image)
- Recipient decrypts and renders the image using key material from the encrypted NIP-17 message
- Unencrypted incoming media from other clients continues to render correctly
- `imeta` tags inside the encrypted envelope contain `encryption`, `key`, and `nonce` fields
- Blob key never appears in logs, database, or any unencrypted transport
- AES-GCM auth tag is verified on decryption; tampered blobs produce a visible error
- Blurhash placeholder renders immediately while encrypted blob is fetched and decrypted
- EXIF stripping occurs before encryption
- `Content-Type: application/octet-stream` is used for encrypted blob uploads
