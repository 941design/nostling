# Identity Secret Loading in Dev Mode - Bug Report

## Bug Description
Updating and applying identity changes fails with error `[dev:app] Error occurred in handler for 'nostling:profiles:update-private': Error: Failed to load identity secret` when running in development environment with persisted users (`make run-dev`).

## Expected Behavior
When an identity is created and persisted in dev mode, the secret should be retrievable across application restarts, allowing profile updates to succeed.

## Reproduction Steps
1. Run app in dev mode: `make run-dev`
2. Create an identity with a private key
3. Stop the app (Ctrl+C)
4. Run app in dev mode again: `make run-dev` (data persists in `/tmp/nostling-dev-data`)
5. Try to update the identity's private profile
6. Observe error: `Failed to load identity secret`

## Actual Behavior
- Error message: `[dev:app] Error occurred in handler for 'nostling:profiles:update-private': Error: Failed to load identity secret`
- The error occurs in `src/main/nostling/profile-service-integration.ts:127` or line 130
- No detailed logging about which `secret_ref` failed or why decryption failed

## Impact
- Severity: High
- Affected Users: Developers using `make run-dev` with persisted data
- Affected Workflows: Profile updates, identity operations requiring secret key access

## Environment/Context
- Development mode: `NOSTLING_DATA_DIR=/tmp/nostling-dev-data`
- Storage location: `/tmp/nostling-dev-data/nostling-secrets.json`
- Encryption: Electron `safeStorage` API (OS keychain-based)

## Root Cause Hypothesis
The issue likely stems from Electron's `safeStorage` encryption behavior:

1. **Storage Key**: Users are stored in SQLite with a `secret_ref` field (format: `nostr-secret:<uuid>`)
2. **Encryption**: Secrets are encrypted using `safeStorage.encryptString()` in `src/main/nostling/secret-store.ts:78-79`
3. **Key Derivation**: `safeStorage` derives encryption keys from OS keychain, which may be session-specific or app-instance-specific
4. **Decryption Failure**: When app restarts, `safeStorage.decryptString()` at line 90 may fail because:
   - The encryption key changed between sessions
   - safeStorage uses a different key derivation in dev mode
   - The encrypted data was created with a different app identity/version

**Evidence**:
- `src/main/nostling/secret-store.ts:86-96` - The `decode()` function catches decryption errors but only logs them, then falls back to UTF-8 decoding which won't work for safeStorage-encrypted data
- Line 92: `log('error', 'Failed to decrypt nostling secret with safeStorage: ${String(error)}')`
- The catch block at line 126-127 in `profile-service-integration.ts` swallows the original error

## Constraints
- Backward compatibility: Existing stored secrets must remain accessible
- Security: Don't weaken encryption in production mode
- Development experience: Dev mode should support data persistence across restarts
- Error visibility: Developers need clear error messages to diagnose issues

## Codebase Context
- Likely location:
  - `src/main/nostling/secret-store.ts` - Secret storage and encryption
  - `src/main/nostling/profile-service-integration.ts:122-131` - Secret loading in updatePrivateProfile
  - `src/main/nostling/profile-service-integration.ts:281-299` - Secret loading in sendPrivateProfileOnAddContact

- Related code:
  - `src/main/paths.ts:28-33` - getUserDataPath() respects NOSTLING_DATA_DIR
  - `Makefile:20-24` - Dev mode sets NOSTLING_DATA_DIR=/tmp/nostling-dev-data

- Storage mechanism:
  - Database: `/tmp/nostling-dev-data/nostling.db` (persists identities with secret_ref)
  - Secrets file: `/tmp/nostling-dev-data/nostling-secrets.json` (persists encrypted secrets)
  - Format: `{ "refs": { "nostr-secret:<uuid>": "<base64-encrypted-data>" } }`

## Required Fixes

### 1. Enhanced Error Logging
Add detailed logging when secret loading fails:
- Which `secret_ref` failed to load
- Whether the ref exists in the secrets file
- The specific safeStorage decryption error
- Context about dev vs production mode

**Locations**:
- `src/main/nostling/profile-service-integration.ts:122-131` (updatePrivateProfile)
- `src/main/nostling/profile-service-integration.ts:281-299` (sendPrivateProfileOnAddContact)
- `src/main/nostling/secret-store.ts:86-96` (decode method)

### 2. E2E Test Coverage
Create failing E2E test that reproduces the issue:
- Test should run in dev mode with data persistence
- Create an identity, stop app, restart app
- Attempt profile update
- Verify it succeeds (currently fails)

**Test file**: `e2e/identity-persistence-dev-mode.spec.ts`

### 3. Root Cause Investigation & Fix
Based on enhanced logging, determine:
- If safeStorage encryption keys are stable across app restarts
- If dev mode needs different secret storage strategy
- Whether to use plaintext or alternative encryption in dev mode

**Potential solutions**:
- Option A: Disable safeStorage encryption in dev mode (when NOSTLING_DATA_DIR is set)
- Option B: Use deterministic encryption key derived from dev environment
- Option C: Store dev secrets in plaintext with clear warnings
- Option D: Investigate if safeStorage can be made stable across restarts

## Out of Scope
- Refactoring entire secret storage architecture
- Production secret storage changes (unless required for fix)
- Migration of existing production secrets
- Adding secret rotation or key management features
