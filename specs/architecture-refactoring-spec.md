---
epic: architecture-refactoring
created: 2026-03-12T00:00:00Z
status: planned
priority: high
---

# Architecture Refactoring

## Problem Statement

The codebase has accumulated structural debt that increases the cost and risk of every feature addition. Two files concentrate excessive responsibility, the IPC layer lacks type safety, legacy code coexists with modern replacements, and the database layer has a durability gap.

Specific concerns:

1. **`NostlingService` (2,081 lines, 56+ methods)** handles identity management, contact management, message storage, encryption/decryption, relay subscription management, polling, P2P signal routing, media attachment handling, mnemonic operations, profile discovery, and outgoing queue flushing. Changes to any subsystem risk breaking others.

2. **`main.tsx` (2,747 lines, 85 hooks, 106 functions)** contains the entire app shell, all modals, SVG icon definitions, sidebar logic, and all event handlers. This makes the file extremely difficult to navigate and test in isolation.

3. **`NostlingIpcDependencies` returns `Promise<any>` for nearly every operation**, nullifying TypeScript's type safety across the entire IPC boundary — the most security-relevant interface in the application.

4. **Legacy IPC handlers coexist with the modern API**. Both flat (`status:get`) and nested (`updates:check`) channel patterns are active. A `TODO.org` entry marks these for removal but they persist.

5. **Dynamic `require()` calls bypass TypeScript**. `p2p-signal-handler.ts:63` uses `require('nostr-tools/pure').finalizeEvent` and `image-processing.ts:19-40` uses `require('jpeg-js')`, `require('pngjs')`, `require('piexifjs')`. These defeat compile-time type checking.

6. **`ciphertext` database column stores plaintext**. The column was named during an early design phase and never renamed, creating confusion for anyone reading SQL or database dumps.

7. **sql.js operates entirely in-memory with a 30-second flush interval**. A crash in that window loses uncommitted writes. The `PRAGMA journal_mode=WAL` has no effect for an in-memory database.

8. **Profile module TODO stubs**. Multiple files in `profile-sender.ts`, `profile-event-builder.ts`, `profile-service-integration.ts`, `display-name-resolver.ts`, `public-profile-discovery.ts`, and `profile-receiver.ts` contain `TODO (pbt-dev)` markers with empty or placeholder function bodies. Tests against these modules verify nothing meaningful.

9. **Dependency misplacement**. `jsdom` is in production `dependencies` but is never imported in production code. `@types/semver` is in `dependencies` rather than `devDependencies`.

10. **`pollMessages()` iterates all identities sequentially** with a 5-second timeout each. For a user with N identities, worst-case polling latency is N × 5 seconds.

## Functional Requirements

### FR-1: Service Decomposition

Split `NostlingService` into focused, single-responsibility services:

- **IdentityService** — Identity CRUD, mnemonic operations, key derivation
- **ContactService** — Contact management, whitelist enforcement
- **MessageService** — Message storage, retrieval, status tracking, queue management
- **EncryptionService** — NIP-04/NIP-17/NIP-59 encrypt/decrypt operations
- **SubscriptionManager** — Relay subscription lifecycle, event routing, polling
- **ProfileService** — Profile building, sending, receiving, discovery, display name resolution

Each service should be independently instantiable and testable. Dependencies between services should be explicit (constructor injection or interface-based).

**Acceptance criteria:**
- No single service file exceeds 500 lines
- Each service has a clear, documented public API
- Existing test suite passes without modification (behavior-preserving refactor)
- IPC handlers delegate to the appropriate service (not a monolithic dependency)

### FR-2: Renderer Component Extraction

Extract `main.tsx` into focused modules:

- **AppShell** — Layout structure (header, sidebar, main area, footer)
- **ViewRouter** — View mode switching logic (chat, identities, contacts, themes, about)
- **Modals** — Identity creation, contact addition, QR scanning, help, mnemonic backup (each as separate component files)
- **SVG Icons** — Move inline SVG definitions to icon component files
- **State hooks** — Extract custom hooks for identity state, contact state, message state, theme state

**Acceptance criteria:**
- `main.tsx` reduced to under 300 lines (composition root only)
- Each extracted component is independently importable
- No behavioral changes visible to the user
- All E2E tests pass

### FR-3: IPC Type Safety

Replace `Promise<any>` returns in `NostlingIpcDependencies` and related interfaces with proper typed interfaces matching the shared types in `src/shared/types.ts`.

**Acceptance criteria:**
- No `any` type in the IPC interface layer
- TypeScript compiler catches type mismatches between IPC handler returns and renderer expectations
- Preload API types match the handler return types exactly

### FR-4: Legacy IPC Removal

Remove the legacy flat-channel IPC handlers (`status:get`, `update:check`, `update:restart`, `update:download`) and the corresponding `legacyApi` in the preload.

**Acceptance criteria:**
- Only the nested channel API (`updates:check`, `config:get`, etc.) is active
- No `legacyApi` object in the preload
- All tests updated to use the current API
- No breaking changes in the renderer (verify it only uses the modern API)

### FR-5: Dynamic Require Elimination

Replace all `require()` calls in production TypeScript with static `import` statements.

**Affected files:**
- `p2p-signal-handler.ts` — `require('nostr-tools/pure')`
- `image-processing.ts` — `require('jpeg-js')`, `require('pngjs')`, `require('piexifjs')`
- `index.ts` — dynamic `require('./nostling/crypto')` inside IPC handler

**Acceptance criteria:**
- No `require()` calls in production `.ts` files
- TypeScript compiler validates all import types at compile time
- Bundle output unchanged (tsup resolves both patterns equivalently)

### FR-6: Database Column Rename

Rename the `ciphertext` column in `nostr_messages` to `content` via a migration, since it stores plaintext message content.

**Acceptance criteria:**
- New migration renames the column
- All queries updated to reference the new column name
- Comment explaining the historical reason removed
- Existing data preserved (ALTER TABLE RENAME COLUMN)

### FR-7: Database Durability Evaluation

Evaluate migration from sql.js (in-memory WebAssembly SQLite) to `better-sqlite3` (native bindings with true on-disk durability).

**Evaluation criteria:**
- Eliminate the 30-second flush window during which a crash loses writes
- Enable real WAL mode for concurrent read performance
- Assess native module compilation requirements for macOS (x64 + ARM) and Linux (x64 + ARM)
- Assess ASAR packaging compatibility
- Measure startup time impact (native vs WASM initialization)

**Acceptance criteria (if migration proceeds):**
- Zero data loss on unexpected process termination
- WAL mode active and verified
- Native module rebuilds automated in CI for all target platforms
- Startup time does not regress by more than 500ms

### FR-8: Profile Module Completion

All `TODO (pbt-dev)` stubs in profile modules must be either completed with real implementations or removed if the functionality is no longer planned.

**Affected modules:**
- `profile-sender.ts`
- `profile-event-builder.ts`
- `profile-service-integration.ts`
- `display-name-resolver.ts`
- `public-profile-discovery.ts`
- `profile-receiver.ts`

**Acceptance criteria:**
- No `TODO (pbt-dev)` markers remain in production code
- Tests against these modules exercise real implementations
- Profile sharing workflows function end-to-end (verified via dual-instance test)

### FR-9: Dependency Cleanup

- Move `jsdom` from `dependencies` to `devDependencies` (or remove if unused in tests)
- Move `@types/semver` from `dependencies` to `devDependencies`
- Update `appId` from `com.example.nostling` to the production value

**Acceptance criteria:**
- Production bundle does not include `jsdom`
- Type packages are in `devDependencies`
- `appId` reflects the actual application identity

### FR-10: Parallel Identity Polling

Replace the sequential `pollMessages()` identity iteration with parallel execution.

**Acceptance criteria:**
- All identities polled concurrently (not sequentially)
- Individual identity polling failures do not block others
- Total polling latency is bounded by the slowest identity (not the sum)
- Error handling preserves per-identity error isolation

## Non-Functional Requirements

- All refactoring must be behavior-preserving (no user-visible changes)
- Full test suite must pass after each individual change
- Changes should be deliverable incrementally (not as one monolithic refactor)

## Risks

- FR-1 (service decomposition) has the highest risk of introducing subtle regressions due to implicit state sharing in the current monolithic service
- FR-7 (database migration) requires careful data preservation testing and native module CI setup
