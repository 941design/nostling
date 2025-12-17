# Secret Storage Security Analysis

**Status**: CRITICAL EXAMINATION
**Date**: 2025-12-16
**Trigger**: Bug fix for dev mode secret persistence exposed broader architectural concerns
**Scope**: Security, reliability, and migration analysis of Nostling's secret storage system

---

## Executive Summary

The current secret storage implementation has a **critical flaw**: when decryption fails, it silently falls back to UTF-8 decoding of encrypted binary data, producing garbage that propagates through the system. This affects both dev and production modes. Additionally, there are no recovery mechanisms for common scenarios like app reinstallation or machine migration.

**Risk Assessment**: HIGH
**Immediate Action Required**: Yes - remove dangerous fallback behavior
**Long-term Action Required**: Yes - implement backup/recovery system

---

## Table of Contents

1. [Current Architecture](#1-current-architecture)
2. [Failure Mode Analysis](#2-failure-mode-analysis)
3. [Security Implications](#3-security-implications)
4. [Attack Vector Analysis](#4-attack-vector-analysis)
5. [Reliability Analysis](#5-reliability-analysis)
6. [Migration Scenarios](#6-migration-scenarios)
7. [Recommended Fixes](#7-recommended-fixes)
8. [Implementation Priority](#8-implementation-priority)

---

## 1. Current Architecture

### 1.1 Storage Mechanism

```
Location (Production): ~/Library/Application Support/Nostling/nostling-secrets.json
Location (Dev Mode):   $NOSTLING_DATA_DIR/nostling-secrets.json (e.g., /tmp/nostling-dev-data/)

Format:
{
  "refs": {
    "nostr-secret:<uuid>": "<base64-encoded-data>",
    "nostr-secret:<uuid>": "<base64-encoded-data>"
  }
}
```

### 1.2 Encryption Layers

| Mode                | Encoding | Encryption           | Key Management         |
|---------------------|----------|----------------------|------------------------|
| Production          | Base64   | Electron safeStorage | OS Keychain            |
| Dev Mode (post-fix) | Base64   | None (plaintext)     | N/A                    |
| Dev Mode (pre-fix)  | Base64   | Electron safeStorage | OS Keychain (unstable) |

### 1.3 Code Flow

```
saveSecret(nsec) → encode(nsec) → base64(safeStorage.encrypt(nsec)) → write to JSON

loadSecret(ref) → read from JSON → decode(encoded) → safeStorage.decrypt(base64decode(encoded)) → nsec
```

### 1.4 Current Error Handling (PROBLEMATIC)

```typescript
// src/main/nostling/secret-store.ts:96-114
private decode(encoded: string): string {
  const buffer = Buffer.from(encoded, 'base64');
  const isDevMode = !!process.env.NOSTLING_DATA_DIR;

  if (!isDevMode && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(buffer);
    } catch (error) {
      log('error', `Failed to decrypt: ${String(error)}`);
      // CRITICAL FLAW: Falls through to line 113
    }
  }

  return buffer.toString('utf8');  // Returns garbage for encrypted data!
}
```

**The Problem**: When decryption fails (for any reason), the code returns `buffer.toString('utf8')` which:
1. Interprets encrypted binary as UTF-8 text
2. Produces garbage characters (mojibake)
3. Returns garbage as the "secret"
4. Downstream code fails with cryptic errors

---

## 2. Failure Mode Analysis

### 2.1 Decryption Failure Scenarios

| Scenario            | Probability | Production | Dev Mode      | Current Behavior |
|---------------------|-------------|------------|---------------|------------------|
| App reinstall       | Medium      | YES        | YES           | Silent garbage   |
| Keychain cleared    | Low         | YES        | N/A           | Silent garbage   |
| Machine migration   | Medium      | YES        | N/A           | Silent garbage   |
| OS upgrade          | Low         | YES        | YES           | Silent garbage   |
| Code signing change | Low         | YES        | N/A           | Silent garbage   |
| Keychain corruption | Very Low    | YES        | N/A           | Silent garbage   |
| Dev mode restart    | HIGH        | N/A        | YES (pre-fix) | Silent garbage   |

### 2.2 Error Propagation Path

```
Decryption Fails
    ↓
UTF-8 decode of encrypted binary
    ↓
Garbage string returned (e.g., "v10f+¢BÏ~¯W]¶T®ï")
    ↓
deriveKeypair(garbage)
    ↓
nip19.decode(garbage)
    ↓
Error: "String must be lowercase or uppercase"
    ↓
Wrapped: "Failed to derive keypair: String must be lowercase or uppercase"
    ↓
Wrapped: "Failed to load identity secret"
    ↓
User sees: IPC handler error, no context
```

### 2.3 User-Visible Symptoms

| Symptom                          | Root Cause            | User Understanding     |
|----------------------------------|-----------------------|------------------------|
| "Failed to load identity secret" | Decryption failure    | None - thinks bug      |
| "Failed to derive keypair"       | Garbage nsec          | None - thinks bug      |
| "String must be lowercase"       | Invalid bech32        | None - cryptic         |
| Profile update fails             | No valid keypair      | Confused - was working |
| App works after restart          | New session, same key | Intermittent issue     |

---

## 3. Security Implications

### 3.1 Confidentiality

| Aspect             | Production            | Dev Mode            | Risk Level |
|--------------------|-----------------------|---------------------|------------|
| At-rest encryption | OS Keychain           | None (plaintext)    | High (dev) |
| Memory exposure    | Uint8Array in memory  | Same                | Medium     |
| Log exposure       | Error messages logged | Same                | Low        |
| File permissions   | User-only             | World-readable /tmp | High (dev) |

**Dev Mode Concern**: Secrets stored as plaintext base64 in `/tmp/nostling-dev-data/nostling-secrets.json`:
- Other processes can read
- Survives app termination
- No automatic cleanup
- Visible in file browsers

### 3.2 Integrity

| Aspect            | Current State     | Risk                   |
|-------------------|-------------------|------------------------|
| Storage integrity | No HMAC/signature | Tampering undetected   |
| Version marker    | None              | Migration issues       |
| Format validation | Minimal           | Malformed data crashes |

**Tampering Scenario**: Attacker modifies `nostling-secrets.json`:
1. Replace encrypted secret with different encrypted value
2. App loads tampered secret
3. If decryption "succeeds" with wrong data, wrong keypair used
4. Messages signed with wrong key, identity confusion

### 3.3 Availability

| Scenario          | Recovery Possible | Data Loss   |
|-------------------|-------------------|-------------|
| App reinstall     | No                | All secrets |
| Keychain clear    | No                | All secrets |
| File deletion     | No                | All secrets |
| File corruption   | No                | All secrets |
| Machine migration | No                | All secrets |

**No Backup/Recovery System**: User loses access to identity permanently if secrets lost.

---

## 4. Attack Vector Analysis

### 4.1 Local Access Attacks

#### 4.1.1 Dev Mode File Access
```bash
# Trivial secret extraction in dev mode
cat /tmp/nostling-dev-data/nostling-secrets.json | jq -r '.refs[]' | base64 -d
# Outputs: nsec1... (plaintext private key)
```

**Mitigation**:
- Acceptable for dev mode
- Document clearly
- Never use for real identities

#### 4.1.2 Production File Access
```bash
# File readable but encrypted
cat ~/Library/Application\ Support/Nostling/nostling-secrets.json
# Outputs: Base64-encoded encrypted binary
```

**Attack**: Copy file, attempt offline decryption
- Requires breaking OS encryption
- safeStorage uses AES-256-GCM on macOS
- Key material in Secure Enclave (if available)

**Mitigation**: OS-level protection adequate for most threat models

### 4.2 Keychain Attacks

#### 4.2.1 App Identity Spoofing
```
Attacker creates app with same bundle ID
    ↓
Signs with different certificate
    ↓
Gatekeeper blocks OR user allows
    ↓
If allowed: access to keychain item
```

**macOS Protections**:
- Gatekeeper blocks unsigned/differently-signed apps
- Keychain ACL requires code signing match
- User must explicitly allow access

**Residual Risk**: Low for signed releases, higher for dev builds

#### 4.2.2 Keychain Extraction
```
Attacker with root access
    ↓
security dump-keychain (requires user password)
    ↓
Extract safeStorage encryption key
    ↓
Decrypt secrets file offline
```

**Mitigation**: Requires root + user password, out of scope for most threat models

### 4.3 Memory Attacks

#### 4.3.1 Memory Dump
```typescript
// Secret exists as Uint8Array in memory
const keypair = deriveKeypair(nsec);  // nsec in memory
// keypair.secretKey is Uint8Array, persists until GC
```

**Attack Surface**:
- Process memory dump
- Core dump on crash
- Debugger attachment

**Current State**: No secure memory handling
- Secrets not zeroed after use
- No memory protection flags
- GC timing unpredictable

**Mitigation Needed**: Secure memory handling for secrets

### 4.4 Social Engineering

#### 4.4.1 "Send Debug Info" Attack
```
Attacker: "I'm from support, send me your nostling-secrets.json for debugging"
User: Sends file
Attacker: Has encrypted secrets (prod) or plaintext (dev)
```

**Mitigation**:
- Document that secrets file should NEVER be shared
- Add warning to file: `"WARNING": "This file contains encrypted secrets. Never share."`

#### 4.4.2 Fake Migration Tool
```
Attacker: "Use this tool to migrate your Nostling data"
Tool: Extracts secrets, sends to attacker
```

**Mitigation**:
- Official migration only through app
- Document official procedures clearly

### 4.5 Supply Chain Attacks

#### 4.5.1 Malicious Update
```
Compromised update server
    ↓
Pushes update with secret exfiltration
    ↓
Update runs with access to keychain
    ↓
Secrets exfiltrated before user notices
```

**Current Mitigations**:
- RSA-signed update manifests
- HTTPS update channels
- Code signing verification

**Residual Risk**: Signing key compromise

---

## 5. Reliability Analysis

### 5.1 Single Points of Failure

| Component    | Failure Mode        | Impact                   | Recovery        |
|--------------|---------------------|--------------------------|-----------------|
| Secrets file | Deleted/corrupted   | All secrets lost         | None            |
| OS Keychain  | Cleared/corrupted   | All secrets inaccessible | None            |
| safeStorage  | API changes         | Decryption fails         | None            |
| App signing  | Certificate expires | New keychain entry       | Manual re-entry |

### 5.2 Silent Failure Modes

The current implementation has **no loud failures**. All decryption failures are swallowed:

```typescript
} catch (error) {
  log('error', ...);  // Logged but not thrown
  // Falls through to garbage return
}
```

**Consequence**: Users don't know secrets are corrupted until downstream operations fail with unrelated errors.

### 5.3 Consistency Guarantees

| Operation     | Atomicity       | Durability           | Consistency     |
|---------------|-----------------|----------------------|-----------------|
| Save secret   | No (file write) | Yes (fsync implicit) | No verification |
| Load secret   | N/A             | N/A                  | No validation   |
| Delete secret | No (file write) | Yes                  | No verification |

**Race Condition Risk**: Concurrent saves could corrupt file (no locking)

---

## 6. Migration Scenarios

### 6.1 Scenario: App Reinstallation

```
State: User has identity with contacts and messages
Action: User uninstalls and reinstalls Nostling
Result:
  - Database preserved (if userData not deleted)
  - Secrets file preserved (if userData not deleted)
  - Keychain entry DELETED (standard macOS behavior)
  - App starts, loads secrets file
  - Decryption fails (no keychain entry)
  - Fallback to garbage
  - All identity operations fail
```

**User Impact**: Complete loss of identity access
**Recovery**: Must re-enter nsec (if user has backup)
**Current Handling**: Silent failure with cryptic errors

### 6.2 Scenario: Machine Migration

```
State: User migrates to new Mac
Method A: Migration Assistant
  - Keychain migrated
  - App data migrated
  - Usually works, but keychain ACLs may differ

Method B: Manual copy
  - Keychain NOT migrated
  - App data copied
  - Decryption fails (no keychain entry)

Method C: iCloud Keychain
  - safeStorage doesn't use iCloud Keychain
  - Secrets not synced
  - Decryption fails on new machine
```

**User Impact**: Potential loss of identity access
**Recovery**: Must re-enter nsec
**Current Handling**: Silent failure

### 6.3 Scenario: Multiple Devices

```
State: User wants same identity on two Macs
Current: Not supported
  - Each device has own keychain
  - Cannot share encrypted secrets
  - Must manually enter nsec on each device
```

**User Expectation**: "I logged in on my laptop, should work on desktop"
**Reality**: No sync, no shared access
**Mitigation Needed**: Explicit documentation or sync feature

### 6.4 Scenario: Developer Testing (Current Bug)

```
State: Developer using make run-dev
Pre-fix:
  - Session 1: Creates identity, secret encrypted with key A
  - Session 2: New Electron instance, key B
  - Decryption fails, garbage returned
  - "Failed to derive keypair" error

Post-fix:
  - Existing secrets still encrypted with old key
  - New code skips safeStorage
  - Still can't decrypt old secrets
  - Same error until secrets file cleared
```

**User Impact**: Dev workflow broken
**Recovery**: `make dev-relay-clean` (loses all dev data)
**Gap**: No migration from encrypted to plaintext

### 6.5 Migration Path Matrix

| From                    | To                         | Supported | Data Preserved | Secrets Preserved |
|-------------------------|----------------------------|-----------|----------------|-------------------|
| Same machine, same app  | Same machine, same app     | Yes       | Yes            | Yes               |
| Same machine, reinstall | Same machine, new install  | Partial   | Maybe          | No                |
| Machine A               | Machine B (Migration Asst) | Partial   | Yes            | Maybe             |
| Machine A               | Machine B (manual)         | No        | Yes            | No                |
| Dev pre-fix             | Dev post-fix               | No        | Yes            | No                |
| Production              | Different Production       | No        | N/A            | No                |

---

## 7. Recommended Fixes

### 7.1 Immediate: Remove Dangerous Fallback (CRITICAL)

**Current** (dangerous):
```typescript
if (!isDevMode && safeStorage.isEncryptionAvailable()) {
  try {
    return safeStorage.decryptString(buffer);
  } catch (error) {
    log('error', `Failed to decrypt: ${String(error)}`);
    // Falls through to garbage!
  }
}
return buffer.toString('utf8');  // NEVER correct for encrypted data
```

**Fixed**:
```typescript
private decode(encoded: string): string {
  const buffer = Buffer.from(encoded, 'base64');
  const isDevMode = !!process.env.NOSTLING_DATA_DIR;

  // Dev mode: secrets stored as plaintext base64
  if (isDevMode) {
    return buffer.toString('utf8');
  }

  // Production mode: secrets encrypted with safeStorage
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(buffer);
    } catch (error) {
      // CRITICAL: Do NOT fall back to UTF-8 decode of encrypted data
      log('error', `Secret decryption failed: ${String(error)}`);
      throw new SecretDecryptionError(
        'Failed to decrypt secret. This may occur after app reinstallation, ' +
        'keychain reset, or machine migration. Recovery requires re-entering ' +
        'your nsec private key.',
        { cause: error }
      );
    }
  }

  // safeStorage unavailable: secrets were stored as plaintext
  return buffer.toString('utf8');
}
```

**Custom Error Class**:
```typescript
export class SecretDecryptionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SecretDecryptionError';
  }
}
```

### 7.2 Short-term: Improve Error UX

**IPC Handler Enhancement**:
```typescript
ipcMain.handle('nostling:profiles:update-private', async (_, request) => {
  try {
    return await dependencies.nostling!.updatePrivateProfile(request);
  } catch (error) {
    if (error instanceof SecretDecryptionError) {
      // Return structured error for UI to handle
      return {
        success: false,
        error: 'SECRET_DECRYPTION_FAILED',
        message: error.message,
        recoveryAction: 'REENTER_NSEC'
      };
    }
    throw error;
  }
});
```

**UI Recovery Flow**:
```
User attempts profile update
    ↓
SecretDecryptionError caught
    ↓
Modal: "Your identity secret could not be accessed"
    ↓
Options:
  [Re-enter nsec] → Opens nsec input modal
  [Delete identity] → Removes corrupted identity
  [Cancel] → Returns to app
```

### 7.3 Medium-term: Add Storage Integrity

**Storage Format v2**:
```json
{
  "version": 2,
  "created": "2025-12-16T00:00:00Z",
  "secrets": {
    "nostr-secret:uuid": {
      "data": "<base64-encoded-secret>",
      "encrypted": true,
      "algorithm": "safeStorage-v1",
      "created": "2025-12-16T00:00:00Z"
    }
  },
  "integrity": "<HMAC-SHA256 of secrets object>"
}
```

**Benefits**:
- Version marker enables migration logic
- `encrypted` flag distinguishes encrypted vs plaintext
- `algorithm` enables future encryption changes
- `integrity` detects tampering/corruption
- Timestamps for debugging

### 7.4 Long-term: Backup and Recovery System

#### 7.4.1 Encrypted Export

```typescript
interface SecretExport {
  version: 1;
  encrypted: true;
  salt: string;           // Random salt for key derivation
  iv: string;             // Initialization vector
  data: string;           // AES-256-GCM encrypted secrets
  tag: string;            // Authentication tag
}

async function exportSecrets(password: string): Promise<SecretExport> {
  const secrets = await getAllSecrets();
  const salt = crypto.randomBytes(16);
  const key = await deriveKey(password, salt);  // PBKDF2 or Argon2
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(secrets), 'utf8'),
    cipher.final()
  ]);
  return {
    version: 1,
    encrypted: true,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    data: encrypted.toString('base64'),
    tag: cipher.getAuthTag().toString('base64')
  };
}
```

#### 7.4.2 QR Code Backup

```typescript
// Single identity backup as QR code
function generateBackupQR(identityId: string): string {
  const nsec = await loadSecret(identityId);
  // QR contains just the nsec - user's responsibility to secure
  return generateQRCode(nsec);
}
```

**Security Note**: QR backup is inherently insecure (screenshot, photo). Use only for convenience, recommend encrypted export for actual backup.

#### 7.4.3 Recovery Key System

```typescript
// On identity creation, generate recovery key
function generateRecoveryKey(nsec: string): string {
  // Split nsec into shares using Shamir's Secret Sharing
  const shares = shamirSplit(nsec, { threshold: 2, shares: 3 });
  // Return one share as "recovery key"
  // Store other share encrypted in app
  return encodeRecoveryKey(shares[0]);
}

// Recovery with key + app share
function recoverWithKey(recoveryKey: string): string {
  const userShare = decodeRecoveryKey(recoveryKey);
  const appShare = loadAppShare();
  return shamirCombine([userShare, appShare]);
}
```

### 7.5 Dev Mode Improvements

#### 7.5.1 Clear Migration Path

```typescript
// On startup in dev mode, detect old encrypted secrets
async function migrateDevSecrets(): Promise<void> {
  const payload = readPayload();
  let needsMigration = false;

  for (const [ref, encoded] of Object.entries(payload.refs)) {
    const buffer = Buffer.from(encoded, 'base64');
    // Check if this looks like encrypted data (has safeStorage header)
    if (looksEncrypted(buffer)) {
      log('warn', `Found encrypted secret ${ref} in dev mode - cannot migrate`);
      needsMigration = true;
    }
  }

  if (needsMigration) {
    log('error',
      'Dev mode migration required: Some secrets were encrypted with a previous ' +
      'session key and cannot be decrypted. Run `make dev-relay-clean` to reset ' +
      'dev environment, then recreate identities.'
    );
    // Optionally: Show dialog to user with instructions
  }
}

function looksEncrypted(buffer: Buffer): boolean {
  // safeStorage encrypted data starts with version byte
  // Plaintext nsec starts with 'nsec1' (0x6e, 0x73, 0x65, 0x63, 0x31)
  const nsecPrefix = Buffer.from('nsec1', 'utf8');
  return !buffer.subarray(0, 5).equals(nsecPrefix);
}
```

#### 7.5.2 Secure Dev Mode Option

```typescript
// Environment variable to use encryption even in dev mode
// Useful for testing encryption behavior
const forceEncryption = process.env.NOSTLING_DEV_FORCE_ENCRYPTION === 'true';
const useEncryption = !isDevMode || forceEncryption;
```

---

## 8. Implementation Priority

### 8.1 Priority Matrix

| Fix | Priority | Effort | Risk if Delayed |
|-----|----------|--------|-----------------|
| Remove garbage fallback | P0 - Critical | Low (1 day) | Users locked out with no explanation |
| Add SecretDecryptionError | P0 - Critical | Low (1 day) | Users can't recover |
| Dev mode migration detection | P1 - High | Low (1 day) | Dev workflow broken |
| Storage format v2 | P2 - Medium | Medium (1 week) | Technical debt |
| Encrypted export | P2 - Medium | Medium (1 week) | No backup capability |
| Recovery key system | P3 - Low | High (2 weeks) | Complex, can defer |
| QR backup | P3 - Low | Low (2 days) | Nice to have |

### 8.2 Suggested Implementation Order

**Phase 1: Critical Fixes (This Week)**
1. Remove garbage fallback in decode()
2. Add SecretDecryptionError with clear message
3. Update IPC handlers to catch and expose error
4. Add UI modal for recovery options
5. Add dev mode migration detection and warning

**Phase 2: Storage Improvements (Next Sprint)**
1. Design storage format v2
2. Implement migration from v1 to v2
3. Add integrity verification
4. Add encrypted flag per secret

**Phase 3: Backup System (Future)**
1. Design encrypted export format
2. Implement export/import UI
3. Add QR backup option
4. Consider recovery key system

### 8.3 Testing Requirements

**Unit Tests**:
- decode() throws SecretDecryptionError on decryption failure
- decode() does NOT fall back to UTF-8 for encrypted data
- Dev mode migration detection works correctly
- Storage integrity verification catches tampering

**Integration Tests**:
- App reinstall scenario (keychain cleared)
- Dev mode restart scenario
- Corrupted secrets file scenario
- Mixed encrypted/plaintext secrets

**E2E Tests**:
- User sees recovery modal on decryption failure
- User can re-enter nsec and recover
- User can delete corrupted identity
- Dev mode warns about old encrypted secrets

---

## Appendix A: Threat Model Summary

| Threat                 | Likelihood | Impact   | Current Mitigation | Recommended            |
|------------------------|------------|----------|--------------------|------------------------|
| Local file read (dev)  | High       | Critical | None               | Document, warn         |
| Local file read (prod) | Medium     | Low      | OS encryption      | Adequate               |
| Keychain extraction    | Low        | Critical | OS protection      | Adequate               |
| Memory dump            | Low        | Critical | None               | Secure memory          |
| App reinstall          | Medium     | High     | None               | Clear errors, recovery |
| Machine migration      | Medium     | High     | None               | Export/import          |
| Silent corruption      | High       | High     | None               | Remove fallback        |
| File tampering         | Low        | Medium   | None               | Integrity check        |
| Social engineering     | Low        | Critical | None               | Documentation          |

## Appendix B: Related Files

```
src/main/nostling/secret-store.ts          - Core implementation
src/main/nostling/secret-store.test.ts     - Unit tests
src/main/nostling/crypto.ts                - Key derivation
src/main/nostling/profile-service-integration.ts - Secret usage
src/main/nostling/service.ts               - Secret usage
bug-reports/identity-secret-loading-dev-mode-report.md - Original bug
```

## Appendix C: References

- [Electron safeStorage Documentation](https://www.electronjs.org/docs/latest/api/safe-storage)
- [macOS Keychain Services](https://developer.apple.com/documentation/security/keychain_services)
- [NIP-19: bech32-encoded entities](https://github.com/nostr-protocol/nips/blob/master/19.md)
- [Shamir's Secret Sharing](https://en.wikipedia.org/wiki/Shamir%27s_Secret_Sharing)
