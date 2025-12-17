# E2E Testing with Secure Storage in Docker

This document explains how Electron's `safeStorage` API works in the Docker E2E testing environment, the challenges encountered with Playwright, and the solution implemented.

## Background

Nostling uses Electron's `safeStorage` API to encrypt sensitive data (nsec keys) at rest. On Linux, this API relies on the system keyring (gnome-keyring, kwallet, or similar) via the Secret Service D-Bus API.

The `secret-store.ts` module enforces secure storage by:
1. Checking `safeStorage.isEncryptionAvailable()`
2. On Linux, additionally checking that `safeStorage.getSelectedStorageBackend()` is not `basic_text`
3. Throwing `SecureStorageUnavailableError` if secure storage is unavailable

## The Problem

E2E tests running in Docker were failing with `SECURE_STORAGE_UNAVAILABLE` errors, even though gnome-keyring was properly configured in the container.

### Docker Environment Setup

The Docker E2E environment (`docker-compose.e2e.yml` and `e2e/docker-entrypoint.sh`) correctly configures:

1. **D-Bus session bus** - Required for Secret Service API communication
2. **gnome-keyring-daemon** - Provides the actual keyring implementation
3. **Xvfb** - Virtual framebuffer for headless GUI testing

The entrypoint script initializes gnome-keyring with:
```bash
echo "" | gnome-keyring-daemon --unlock --components=secrets
```

### The Discrepancy

Investigation revealed a critical difference:

| Launch Method | Backend Reported |
|--------------|------------------|
| Direct Electron run (`scripts/check-safe-storage.js`) | `gnome_libsecret` |
| Playwright-launched Electron | `basic_text` |

Both used the same Docker container with identical environment, yet produced different results.

## Root Cause

Playwright's `electron.launch()` injects a loader script using Node's `-r` (require) flag:

```
electron -r /path/to/playwright/loader.js ./dist/main/index.js
```

This loader injection interferes with Chromium's command-line argument parsing. When Electron processes its arguments, flags like `--password-store=gnome-libsecret` passed in the `args` array are not properly recognized.

### Failed Approaches

1. **Passing flags in `args` array**:
   ```typescript
   const electronApp = await electron.launch({
     args: ['--password-store=gnome-libsecret', ...],
   });
   ```
   Result: Flag ignored due to loader injection.

2. **Using `ELECTRON_EXTRA_LAUNCH_ARGS` environment variable**:
   ```typescript
   env: {
     ELECTRON_EXTRA_LAUNCH_ARGS: '--password-store=gnome-libsecret',
   }
   ```
   Result: Not supported by Playwright's launch mechanism.

## The Solution

Use `app.commandLine.appendSwitch()` in the main process before any app initialization:

```typescript
// src/main/index.ts
import { app } from 'electron';

// On Linux in CI/test environment, configure password store to use gnome-libsecret
// This must be called BEFORE app.whenReady() to take effect
if (process.platform === 'linux' && (process.env.CI || process.env.NODE_ENV === 'test')) {
  app.commandLine.appendSwitch('password-store', 'gnome-libsecret');
}
```

### Why This Works

1. **Timing**: The switch is appended before `app.whenReady()`, ensuring Chromium sees it during initialization
2. **Bypasses parsing**: `appendSwitch()` directly modifies the internal command-line state, bypassing argument parsing entirely
3. **Works with loaders**: Since it's called from within the app, Playwright's loader injection doesn't affect it

### Scope Limitation

The fix is scoped to Linux CI/test environments only:
- `process.platform === 'linux'` - Only applies on Linux
- `process.env.CI || process.env.NODE_ENV === 'test'` - Only in CI or test mode

This ensures no impact on production behavior or other platforms.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Docker Container                         │
│                                                              │
│  ┌──────────────┐    D-Bus     ┌───────────────────────┐   │
│  │    Xvfb      │◄────────────►│  gnome-keyring-daemon │   │
│  │  (Display)   │              │    (Secret Service)   │   │
│  └──────┬───────┘              └───────────┬───────────┘   │
│         │                                  │                │
│         │                                  │ Secret Service │
│         │                                  │ D-Bus API      │
│         ▼                                  ▼                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Electron                          │   │
│  │  ┌─────────────────────────────────────────────┐    │   │
│  │  │ app.commandLine.appendSwitch(               │    │   │
│  │  │   'password-store', 'gnome-libsecret'       │    │   │
│  │  │ )                                           │    │   │
│  │  └─────────────────────────────────────────────┘    │   │
│  │                         │                            │   │
│  │                         ▼                            │   │
│  │  ┌─────────────────────────────────────────────┐    │   │
│  │  │ safeStorage.getSelectedStorageBackend()     │    │   │
│  │  │ → 'gnome_libsecret'                         │    │   │
│  │  └─────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                                │
│                            ▼                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Playwright                        │   │
│  │  electron.launch({ args: [...] })                   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Relevant Files

| File | Purpose |
|------|---------|
| `src/main/index.ts` | Contains `app.commandLine.appendSwitch()` fix |
| `src/main/nostling/secret-store.ts` | Secure storage implementation with backend validation |
| `e2e/fixtures.ts` | Playwright test fixtures for Electron |
| `docker-compose.e2e.yml` | Docker Compose configuration for E2E tests |
| `e2e/docker-entrypoint.sh` | Container entrypoint that initializes D-Bus and gnome-keyring |

## Verification

To verify secure storage is working in Docker E2E:

```bash
# Run the identities-panel tests (requires secure storage)
make test-e2e-file FILE=e2e/identities-panel.spec.ts
```

All 13 tests should pass, confirming that:
1. gnome-keyring is accessible via D-Bus
2. `safeStorage` reports `gnome_libsecret` backend
3. Secrets can be encrypted and decrypted successfully

## Troubleshooting

### Tests fail with SECURE_STORAGE_UNAVAILABLE

1. **Check D-Bus is running**: The entrypoint should start `dbus-daemon --session`
2. **Check gnome-keyring is unlocked**: Look for "Keyring started and unlocked" in logs
3. **Verify appendSwitch is called**: Ensure `src/main/index.ts` has the fix and `NODE_ENV=test` is set

### Backend reports 'basic_text'

1. **Check timing**: `appendSwitch` must be called before `app.whenReady()`
2. **Check environment**: Ensure `CI=true` or `NODE_ENV=test` is set in container
3. **Check gnome-keyring components**: Daemon must be started with `--components=secrets`

## References

- [Electron safeStorage API](https://www.electronjs.org/docs/latest/api/safe-storage)
- [Electron app.commandLine](https://www.electronjs.org/docs/latest/api/command-line)
- [Chromium password-store flag](https://www.chromium.org/developers/design-documents/os-x-password-manager-keychain-integration/)
- [gnome-keyring D-Bus API](https://wiki.gnome.org/Projects/GnomeKeyring)
- [Playwright Electron testing](https://playwright.dev/docs/api/class-electron)
