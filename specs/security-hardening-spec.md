---
epic: security-hardening
created: 2026-03-12T00:00:00Z
status: planned
priority: critical
---

# Security Hardening

## Problem Statement

A March 2026 technical audit identified multiple defense-in-depth gaps in Nostling's security posture. While the core architecture (context isolation, OS keychain, NIP-17/59 encryption) is sound, several issues increase the attack surface unnecessarily:

1. **Electron 35 is 6 major versions behind current (41)**. Each major Electron version inherits Chromium security patches. V8 CVE-2025-10585 was actively exploited in 2025. Accumulated Chromium CVEs represent unpatched, known vulnerabilities in the renderer process.

2. **No Content-Security-Policy (CSP) header**. The renderer can execute inline scripts and load resources from arbitrary origins. For an application that renders user-provided content (message text, profile image URLs, external avatar URLs), this is a meaningful XSS defense gap.

3. **Preload `removeAllListeners` bug**. The `onUpdateState` cleanup function calls `ipcRenderer.removeAllListeners('update-state')`, which removes ALL listeners for that channel — not just the one registered by the current hook. If multiple components subscribe to the same channel, cleanup of one silently breaks the others.

4. **Cryptographic test suite excluded from CI**. `crypto.test.ts` is listed in `jest.config.js` `testPathIgnorePatterns`. The cryptographic core (NIP-04, NIP-17, NIP-59 encryption/decryption) — the most security-critical code in the application — runs no tests in the default test suite.

5. **Test API surface exposed in production preload**. `window.api.test` (with methods like `injectProfile`) is unconditionally available in the renderer. While IPC handlers only respond when `NODE_ENV=test`, the channel surface exists for any JavaScript executing in the renderer to probe.

## Functional Requirements

### FR-1: Electron Version Currency

The application must track Electron stable releases within one major version. The current gap (35 → 41) must be closed.

**Acceptance criteria:**
- Electron dependency updated to latest stable (41.x as of March 2026)
- All existing tests pass on the updated version
- Native module rebuilds (`better-sqlite3` or `sql.js` WASM) verified
- macOS and Linux packaging confirmed functional
- Auto-update verification flow tested end-to-end

**Ongoing policy:**
- Electron major version updates within 30 days of stable release
- Minor/patch updates within 7 days when they contain security fixes

### FR-2: Content-Security-Policy

Add a restrictive CSP that prevents inline script execution and limits resource loading to known origins.

**Required directives:**
- `default-src 'self'` — baseline restriction
- `script-src 'self'` — no inline scripts, no eval
- `style-src 'self' 'unsafe-inline'` — Chakra UI requires inline styles via Emotion
- `img-src 'self' https: data:` — allow HTTPS images (profile pictures, banners, avatars) and data URIs (QR codes)
- `connect-src 'self' wss: https:` — allow WebSocket relay connections and HTTPS API calls (Blossom, avatar API)
- `font-src 'self'` — local fonts only
- `object-src 'none'` — no plugins
- `base-uri 'self'` — prevent base tag hijacking
- `form-action 'self'` — prevent form submission to external origins

**Implementation approach:**
- Set CSP via `session.defaultSession.webRequest.onHeadersReceived` in the main process (more reliable than meta tag for Electron)
- CSP violations logged to the application log for debugging
- Dev mode may relax `script-src` to allow Vite HMR (`'unsafe-eval'` in dev only)

**Acceptance criteria:**
- CSP header present on all renderer page loads
- No CSP violation errors in production operation (normal workflows)
- Vite dev server still functions with relaxed dev CSP
- All existing E2E tests pass

### FR-3: IPC Listener Cleanup Fix

Replace `ipcRenderer.removeAllListeners(channel)` with `ipcRenderer.removeListener(channel, specificListener)` in all preload cleanup functions.

**Affected locations:**
- `onUpdateState` cleanup (preload lines 30, 54)
- Any other `on*` subscription cleanup that uses `removeAllListeners`

**Acceptance criteria:**
- Multiple components can subscribe to the same IPC event channel simultaneously
- Cleanup of one subscription does not affect others
- No event listener memory leaks (listeners properly removed on unmount)

### FR-4: Cryptographic Test Suite in CI

The `crypto.test.ts` exclusion must be removed from `jest.config.js` `testPathIgnorePatterns`.

**Acceptance criteria:**
- `crypto.test.ts` runs as part of the default `npm test` command
- All cryptographic tests pass
- If tests require specific environment setup (e.g., nostr-tools version compatibility), document it rather than excluding the file
- CI pipeline runs crypto tests on every commit

### FR-5: Test API Isolation from Production

The `testApi` object must not be available in the renderer in production builds.

**Acceptance criteria:**
- `window.api.test` is `undefined` in production builds
- Test functionality remains available when `NODE_ENV=test`
- No behavioral change in the test suite
- Build-time elimination verified (not just runtime gating)

## Non-Functional Requirements

- Security patches must not introduce regressions in existing functionality
- CSP must not break any existing UI workflow (themes, modals, image loading, QR codes, avatar browser)
- Electron updates must be tested on both macOS and Linux before release

## Dependencies

- FR-1 may require updating `electron-builder` if the current version doesn't support the target Electron
- FR-2 requires audit of all resource loading patterns in the renderer (images, WebSockets, fetch calls)
- FR-5 requires a build-time mechanism (environment variable, conditional compilation, or separate preload entry point)
