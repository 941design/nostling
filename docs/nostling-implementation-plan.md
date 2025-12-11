# Nostling MVP Implementation Plan

This document lists the exact tasks required to start implementing the Nostr client MVP described in `specs/nostling.md`. Tasks are ordered top-to-bottom to match the expected execution flow. Status values will be updated as work progresses.

## Task Legend
- **Not Started** – work has not begun.
- **In Progress** – actively being implemented.
- **Blocked** – paused pending a dependency or decision.
- **Done** – task completed and verified.
- **Done (with gaps)** – implemented but has documented shortcomings.

## Execution Plan

1. **Review existing application architecture and constraints**
   - Confirm Electron/React separation, IPC patterns, database migration workflow, and Chakra UI conventions to avoid architecture changes.
   - Identify existing logging, persistence, and configuration hooks that nostling features should reuse.
   - **Status:** Done

2. **Define shared nostling domain types**
   - Add shared TypeScript interfaces/enums for identities, contacts, messages, relay settings, and whitelist state in `src/shared/types.ts` (or a new shared module if needed).
   - Ensure types cover data model fields from the spec (npub, secret refs, pending/connected states, message statuses, timestamps).
   - **Status:** Done

3. **Design persistence schema and migrations**
   - Extend the SQLite migration stack under `src/main/database/migrations` to create tables for identities, contacts, messages, and relay settings.
   - Include indexes needed for common lookups (by identity/contact, timestamps, message status queueing).
   - Keep migration structure consistent with existing generated/recorded format.
   - **Status:** Done

4. **Implement secret-store abstraction**
   - Create a pluggable secret-store interface in the main process for managing private keys (local encrypted storage default; hook points for external stores later).
   - Store only references in config/db while keeping keys out of app config when external store is active.
   - **Status:** Done

5. **Main-process nostling services**
   - Build a nostr service in the main process responsible for:
     - Managing identities and contacts (create/import, remove, pending/connected transitions).
     - Handling the handshake flow (welcome message send/receive, mutual connection detection).
     - Managing a message queue with offline support and relay publish/subscribe filters (kind 4 only).
     - Enforcing whitelist filtering and discarding unknown senders with logging hooks.
   - Integrate with existing logging and persistence layers.
   - **Status:** Done

6. **IPC and preload contracts for nostling**
   - Define IPC channels for nostling operations (identities, contacts, messages, relay config) following the existing domain-prefixed handler style.
   - Expose strongly typed APIs through the preload bridge without altering existing update/config APIs.
   - **Status:** Done

7. **Renderer state and data-fetching layer**
   - Add client-side state hooks/services to load and mutate nostling data via the preload APIs.
   - Ensure offline/queue status is visible and error surfaces go through the existing footer/logging patterns.
   - **Status:** Done

8. **Renderer UI: sidebar and identity/contact workflows**
   - Replace placeholder sidebar with identity list and contact list (pending/connected indicators) as described in the spec.
   - Implement create/import identity modal and add-contact (scan/paste npub) modal flows using Chakra UI conventions.
   - **Status:** Done (with gaps)
   - **Gaps:**
     - No QR code scanning (only text paste for npub supported).

9. **Renderer UI: messaging pane**
   - Build threaded conversation view with incoming/outgoing grouping, timestamps, and status badges (queued/sending/sent/error).
   - Add message composer with offline queue awareness and controls wired to the nostling message API.
   - **Status:** Done

10. **Relay configuration UI**
    - Add a renderer surface (likely under existing Electron menu or a small settings section) to view/edit relay list per spec while reusing config patterns.
    - **Status:** Done

11. **Error handling and logging pass**
    - Ensure nostling flows log via the existing main-process logger and surface non-blocking footer messages in the renderer.
    - Verify unknown sender handling, relay errors, and decryption failures follow spec (silent discard + log).
    - **Status:** Done
    - **Note:** Relay connectivity status available via `getRelayStatus()` API.

12. **Testing and validation**
    - Add unit tests for new services (secret store, nostr service, database migrations) and renderer components where feasible.
    - Include basic integration/IPC tests to confirm handshake/queue logic and whitelist enforcement.
    - **Status:** In Progress
    - **Progress:**
      - Service unit tests implemented (`src/main/nostling/service.test.ts`) covering identity creation, welcome message queueing, pending→connected transitions, whitelist enforcement, decryption failure handling, and relay filter generation.
    - **Gaps:**
      - No UI/component tests for sidebar, messaging pane, or modals.
      - No integration/E2E tests for full flow (identity → contact → message).
      - No preload/IPC handler tests.

---

## Critical Shortcomings Summary

~~The following gaps block actual Nostr protocol functionality~~ **RESOLVED** (2025-12-11):

### High Priority (Blocks MVP completion) - ✅ ALL RESOLVED
1. ~~**No actual message encryption**~~ ✅ – NIP-04 encryption implemented via nostr-tools.
2. ~~**No actual relay connections**~~ ✅ – RelayPool with WebSocket subscription/publishing integrated.
3. ~~**No key derivation**~~ ✅ – bip340 key derivation implemented (nsec → keypair).
4. ~~**No message polling**~~ ✅ – Relay subscriptions with real-time event handling.

### Medium Priority (MVP usability)
1. **No QR code scanning** – Only text paste for npub.
2. ~~**No relay connectivity status**~~ ✅ – `getRelayStatus()` API available.

### Low Priority (Post-MVP)
1. **No UI tests** – Component tests missing.
2. **No integration tests** – Full flow tests missing.
3. **No external secret store integration** – Pluggable but not implemented.

---

## Completed Improvements

- **Auto-retry for failed sends** – Added `retryFailedMessages()` to service, IPC, preload, and renderer state. UI button appears in NostlingStatusCard when errors exist.
- **Nostr Protocol Integration** (2025-12-11) – Full implementation of:
  - Key derivation from nsec using nostr-tools bip340
  - NIP-04 message encryption/decryption
  - RelayPool with WebSocket connection management
  - Real-time subscriptions for kind-4 events
  - Service lifecycle management (initialize/destroy)
  - 68 passing tests covering crypto, relay-pool, and service

---

## Next Steps

~~A feature specification for the core protocol work has been drafted: `specs/nostr-protocol-integration.md`~~ **IMPLEMENTED**

The protocol integration is complete. Remaining work:
- QR code scanning for npub import
- UI component tests
- End-to-end integration tests
- External secret store integration (optional)
