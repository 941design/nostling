# Feature: Migrate Manifest Signing from Ed25519 to RSA

## Overview
Replace the current Ed25519-based manifest signing system with RSA to enable native GPG key management and simplify the cryptographic key workflow.

## Background
Currently, the project uses Ed25519 (via `tweetnacl`) for signing update manifests. While Ed25519 is modern and efficient, extracting Ed25519 keys from GPG is complex and error-prone. RSA provides better GPG integration with standard PEM format exports, making key management significantly easier.

## Goals
1. Replace Ed25519 signing with RSA-4096 signing
2. Use GPG-native key generation and export workflow
3. Maintain cryptographic verification of update manifests
4. Support standard PEM format for private keys
5. Update documentation with GPG-based key management instructions

## Non-Goals
- Backward compatibility with existing Ed25519-signed manifests (this is a breaking change for the update system)
- Support for multiple signature algorithms simultaneously

## Technical Requirements

### 1. Update Manifest Generation Script (`scripts/generate-manifest.ts`)
- Replace `tweetnacl` with Node.js built-in `crypto` module
- Accept RSA private key in PEM format (armor-encoded)
- Change environment variable from `SLIM_CHAT_ED25519_PRIVATE_KEY` to `SLIM_CHAT_RSA_PRIVATE_KEY`
- Use SHA-256 with RSA for signing (standard `crypto.createSign('SHA256')`)
- Generate base64-encoded RSA signature
- Maintain existing manifest structure: `{ version, files[], signature }`

### 2. Update Manifest Verification Code
**Location:** Identify where manifest verification occurs in the codebase (likely in main process auto-update logic)

- Replace `tweetnacl` verification with `crypto.createVerify('SHA256')`
- Accept RSA public key in PEM format
- Verify signatures against manifest payload
- Maintain existing security properties (prevent downgrades, validate versions)

### 3. Update Dependencies
- Remove `tweetnacl` dependency from `package.json` (verify it's not used elsewhere first)
- Remove `@types/tweetnacl` if present
- No new dependencies needed (use Node.js built-in `crypto`)

### 4. Update GitHub Actions Workflow (`.github/workflows/release.yml`)
- Rename environment variable from `SLIM_CHAT_ED25519_PRIVATE_KEY` to `SLIM_CHAT_RSA_PRIVATE_KEY`
- Update secret reference in workflow
- Ensure PEM format is properly passed (may need multi-line secret handling)

### 5. Update Documentation (`README.md`)
Replace Ed25519 key generation section with RSA workflow:

```bash
# Generate RSA-4096 key in GPG
gpg --quick-gen-key "SlimChat Release <release@example.com>" rsa4096 sign never

# Export private key (PEM armor format)
gpg --export-secret-keys --armor "SlimChat Release" > slimchat-private.asc

# Export public key (PEM armor format)
gpg --export --armor "SlimChat Release" > slimchat-public.asc

# For CI: Store entire content of slimchat-private.asc as SLIM_CHAT_RSA_PRIVATE_KEY secret
# For app: Embed content of slimchat-public.asc in source code
```

### 6. Code Changes Required

**File: `scripts/generate-manifest.ts`**
- Import `crypto` instead of `nacl`
- Read `SLIM_CHAT_RSA_PRIVATE_KEY` (PEM format, multi-line)
- Use `crypto.createSign()` for signing
- Expected signature size: ~512 bytes (base64) vs current 64 bytes

**File: Search for manifest verification logic** (needs investigation)
- Replace Ed25519 verification with RSA verification
- Update embedded public key constant/configuration

## Implementation Steps

1. **Investigation Phase:**
   - Search codebase for manifest verification code
   - Confirm `tweetnacl` is only used for signing/verification (no other features)
   - Identify where public key is currently stored/used

2. **Development Phase:**
   - Update `generate-manifest.ts` to use RSA/crypto
   - Update verification code to use RSA/crypto
   - Update environment variable names throughout
   - Remove `tweetnacl` dependency

3. **Testing Phase:**
   - Generate test RSA keypair with GPG
   - Test manifest generation locally
   - Test manifest verification in app
   - Verify CI workflow with test secret

4. **Documentation Phase:**
   - Update README.md with new key generation instructions
   - Document the migration (breaking change notice)
   - Update any inline code comments

## Security Considerations
- RSA-4096 provides equivalent security to Ed25519 (both ~128-bit security level)
- PEM format is industry standard and well-audited
- Private key still must never be committed to repository
- Public key rotation process remains the same

## Breaking Changes
- Existing Ed25519-signed manifests will not verify with new RSA public key
- Users on old versions will need manual update to version with new public key
- GitHub secret needs to be regenerated and replaced

## Success Criteria
- [ ] Manifest generation uses RSA signing with GPG-exported keys
- [ ] Manifest verification uses RSA with embedded public key
- [ ] CI workflow successfully generates signed manifests
- [ ] Documentation clearly explains GPG-based key management
- [ ] All tests pass with new signing mechanism
- [ ] `tweetnacl` dependency removed (if not used elsewhere)

## Resolved Questions (From Codebase Exploration)

### 1. Where is the current public key stored for verification?
**Answer:** `src/main/index.ts:18-19`
- Format: Base64-encoded 32-byte Ed25519 public key
- Source: `ED25519_PUBLIC_KEY` environment variable with fallback to placeholder
- Usage: Passed through `verifyDownloadedUpdate()` → `verifyManifest()` → `verifySignature()`

### 2. Is `tweetnacl` used for any other purpose in the codebase?
**Answer:** NO - Safe to remove
- Used exclusively for Ed25519 manifest signing/verification
- 5 files: verify.ts, manifest-generator.ts, generate-manifest.ts, and their tests
- Only 2 API functions used: `nacl.sign.detached()` and `nacl.sign.detached.verify()`

### 3. Should we support a transition period with both signature formats?
**Decision:** Hard cutover (breaking change)
- Matches "Non-Goals" section (no backward compatibility)
- Simpler implementation and cleaner architecture
- Users must manually update to new version

### 4. What's the migration strategy for existing users with the old public key?
**Strategy:** Breaking change with documentation
- Users need to manually download new version with RSA public key
- Update changelog with migration notice
- Document in release notes

## Additional Findings

### Files Requiring Updates:
1. **`src/main/security/verify.ts`** - Core signature verification (tweetnacl → crypto)
2. **`src/main/update/manifest-generator.ts`** - Signing logic (tweetnacl → crypto)
3. **`scripts/generate-manifest.ts`** - Build script (tweetnacl → crypto)
4. **`src/main/index.ts:18-19`** - Update public key constant (Ed25519 → RSA, base64 → PEM)
5. **`.github/workflows/release.yml:19`** - Environment variable rename
6. **`package.json`** - Remove tweetnacl dependency
7. **Test files** - Update verification tests for RSA

### Current Manifest Structure:
```typescript
interface SignedManifest {
  version: string;           // semver
  artifacts: ManifestArtifact[];  // NOT "files" - already updated
  createdAt: string;         // ISO 8601
  signature: string;         // base64 signature
}
```
**Note:** Spec mentioned `files[]` but codebase uses `artifacts[]` - no change needed.

### Verification Flow:
1. Signature verification (Ed25519 → RSA)
2. Version validation (prevent downgrades)
3. Platform matching
4. SHA-256 hash verification (already using SHA-256, not SHA-512)
