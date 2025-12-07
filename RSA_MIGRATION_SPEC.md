# RSA Signing Migration - Implementation Specification

## Overview
This document details the implementation tasks for migrating from Ed25519 to RSA-4096 signing for update manifests.

## Architecture Summary

The migration involves three independent components:

1. **RSA Signature Verification** (verify-rsa.ts)
   - Replaces tweetnacl Ed25519 verification with crypto.createVerify('SHA256')
   - Changes public key format from base64-encoded 32 bytes to PEM format
   - Maintains exact same verification flow logic

2. **RSA Manifest Generation** (manifest-generator-rsa.ts)
   - Replaces tweetnacl Ed25519 signing with crypto.createSign('SHA256')
   - Changes private key format from base64-encoded 64 bytes to PEM format
   - Maintains exact same manifest structure

3. **Build Script RSA Signing** (generate-manifest-rsa.ts)
   - Standalone script for CI/CD builds
   - Uses crypto.createSign('SHA256') instead of tweetnacl
   - Updates environment variable name from SLIM_CHAT_ED25519_PRIVATE_KEY to SLIM_CHAT_RSA_PRIVATE_KEY

All three components are INDEPENDENT and can be implemented in parallel.

## Shared Contracts

All components use these shared types (already defined in shared/types.ts):

```typescript
interface SignedManifest {
  version: string;
  artifacts: ManifestArtifact[];
  createdAt: string;
  signature: string;  // base64-encoded signature
}

interface ManifestArtifact {
  url: string;
  sha256: string;  // lowercase hex, 64 chars
  platform: 'darwin' | 'linux' | 'win32';
  type: 'dmg' | 'zip' | 'AppImage' | 'exe';
}
```

## RSA Cryptographic Standards

All implementations must use:
- **Algorithm**: RSASSA-PKCS1-v1_5 (default for crypto.createSign/createVerify)
- **Hash**: SHA-256
- **Key Format**: PEM (Privacy Enhanced Mail) - armor-encoded text
- **Signature Encoding**: Base64

### PEM Format Examples

**Public Key** (passed to verification):
```
-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA...
(multiple lines of base64)
...
-----END PUBLIC KEY-----
```

**Private Key** (passed to signing):
```
-----BEGIN PRIVATE KEY-----
MIIJQgIBADANBgkqhkiG9w0BAQEFAASCCSwwggkoAgEA...
(multiple lines of base64)
...
-----END PRIVATE KEY-----
```

## Implementation Tasks

### TASK 1: src/main/security/verify-rsa.ts:verifySignature

Implement RSA signature verification using Node.js crypto module.

**Dependencies**: None (uses only Node.js built-ins)

**Contract Reference**: See verify-rsa.ts lines 14-46

**Key Points**:
- Replace nacl.sign.detached.verify with crypto.createVerify
- Use 'SHA256' algorithm
- Public key is PEM format (multi-line string)
- Signature is base64-encoded
- Return false on any error (graceful failure)

**Testing Requirements**:
- Property: Valid signatures verify as true
- Property: Modified payload invalidates signature
- Property: Invalid PEM format returns false
- Property: Invalid base64 signature returns false
- Example: Known RSA key pair with test manifest

### TASK 2: src/main/security/verify-rsa.ts:verifyManifest

Implement complete manifest verification flow using RSA.

**Dependencies**:
- verifySignature (from TASK 1)
- validateVersion (from existing version.ts)
- hashFile, hashMatches (from existing crypto.ts)

**Contract Reference**: See verify-rsa.ts lines 86-131

**Key Points**:
- Identical logic to Ed25519 version except calls RSA verifySignature
- Verification order: signature → version → platform → hash
- Short-circuit on first failure
- Return { verified: true } only if all checks pass

**Testing Requirements**:
- Property: All verification steps must pass for success
- Property: Any failing step rejects with appropriate error
- Property: Verification order maintained (signature checked first)
- Example: End-to-end verification with valid RSA-signed manifest

### TASK 3: src/main/update/manifest-generator-rsa.ts:generateManifest

Implement RSA-based manifest generation for programmatic use.

**Dependencies**:
- detectPlatform (trivial helper, already implemented in stub)
- hashFunction (passed as parameter, typically from crypto.ts)

**Contract Reference**: See manifest-generator-rsa.ts lines 69-120

**Key Points**:
- Replace nacl.sign.detached with crypto.createSign
- Use 'SHA256' algorithm
- Private key is PEM format
- Sign canonical JSON: JSON.stringify(unsigned, null, 0)
- Return signed manifest with base64 signature

**Testing Requirements**:
- Property: Generated signature verifies with corresponding public key
- Property: All artifacts in directory are included
- Property: createdAt is valid ISO 8601 timestamp
- Example: Generate manifest for test artifacts, verify with public key

### TASK 4: scripts/generate-manifest-rsa.ts (complete script)

Implement standalone build script for CI/CD.

**Dependencies**: None (self-contained script)

**Contract Reference**: See generate-manifest-rsa.ts lines 32-74

**Key Points**:
- Reads SLIM_CHAT_RSA_PRIVATE_KEY from environment
- Filters artifacts: .AppImage, .dmg, .zip extensions only
- Uses SHA-256 for file hashing
- Creates manifest with 'files' field (not 'artifacts' - legacy format)
- Writes to dist/manifest.json with pretty-printing

**Testing Requirements**:
- Property: Generated manifest structure matches expected format
- Property: Signature verifies with corresponding public key
- Property: Missing environment variable throws clear error
- Example: Run script with test artifacts, verify output

## Integration After Implementation

After all tasks complete, the orchestrator will:

1. Replace old files with new ones:
   - verify.ts → verify-rsa.ts content
   - manifest-generator.ts → manifest-generator-rsa.ts content
   - scripts/generate-manifest.ts → generate-manifest-rsa.ts content

2. Update package.json:
   - Remove tweetnacl dependency
   - No new dependencies needed

3. Update src/main/index.ts:
   - Change ED25519_PUBLIC_KEY → RSA_PUBLIC_KEY
   - Update fallback placeholder to PEM format

4. Update .github/workflows/release.yml:
   - Change SLIM_CHAT_ED25519_PRIVATE_KEY → SLIM_CHAT_RSA_PRIVATE_KEY

5. Run full test suite to verify no regressions

6. Create integration tests for RSA signing system

## Notes for pbt-dev Agents

- Use fast-check for property-based testing (already in project dependencies)
- Test files should be named: *.test.ts
- Use Jest testing framework (already configured)
- Crypto module is Node.js built-in - no imports needed beyond `import crypto from 'crypto'`
- All implementations must handle errors gracefully (try-catch, return false, or throw descriptive errors)
- PEM format is plain text - no need for special parsing beyond passing to crypto functions
- Base64 encoding/decoding: use Buffer.from(str, 'base64') and buf.toString('base64')
