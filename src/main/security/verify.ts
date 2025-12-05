/**
 * GAP-001, GAP-006, GAP-008: Manifest verification with Ed25519 signatures and SHA-256 hashes
 *
 * This module verifies downloaded update artifacts against signed manifests.
 * Security-critical: all cryptographic operations must succeed before accepting updates.
 */

import nacl from 'tweetnacl';
import { SignedManifest, ManifestArtifact } from '../../shared/types';
import { hashFile, hashMatches } from './crypto';
import { validateVersion } from './version';

/**
 * Verify Ed25519 signature on manifest
 *
 * CONTRACT:
 *   Inputs:
 *     - manifest: SignedManifest object with version, artifacts, createdAt, signature fields
 *     - publicKeyBase64: base64-encoded Ed25519 public key (32 bytes → 44 base64 chars)
 *
 *   Outputs:
 *     - boolean: true if signature valid, false otherwise
 *
 *   Invariants:
 *     - Signature covers canonical JSON of { version, artifacts, createdAt }
 *     - Public key must be exactly 32 bytes (Ed25519 requirement)
 *     - Signature must be exactly 64 bytes (Ed25519 requirement)
 *
 *   Properties:
 *     - Authenticity: only private key holder can produce valid signature
 *     - Integrity: any modification to version/artifacts/createdAt invalidates signature
 *     - Deterministic: same manifest + key produces same verification result
 *
 *   Algorithm:
 *     1. Extract payload: { version, artifacts, createdAt } from manifest
 *     2. Canonicalize payload as JSON string (no whitespace)
 *     3. Convert payload string to Buffer (UTF-8 encoding)
 *     4. Decode signature from manifest.signature (base64 → Buffer)
 *     5. Decode public key from publicKeyBase64 (base64 → Buffer)
 *     6. Verify signature using nacl.sign.detached.verify(message, signature, publicKey)
 *     7. Return verification result (boolean)
 *
 *   Error Conditions:
 *     - Invalid base64 encoding: return false
 *     - Wrong key length: return false
 *     - Wrong signature length: return false
 */
export function verifySignature(
  manifest: SignedManifest,
  publicKeyBase64: string
): boolean {
  try {
    // Extract payload: { version, artifacts, createdAt }
    const payload = {
      version: manifest.version,
      artifacts: manifest.artifacts,
      createdAt: manifest.createdAt,
    };

    // Canonicalize payload as JSON string (no whitespace)
    const payloadString = JSON.stringify(payload, null, 0);
    const messageBuffer = Buffer.from(payloadString, 'utf-8');

    // Decode signature from base64
    const signatureBuffer = Buffer.from(manifest.signature, 'base64');

    // Decode public key from base64
    const publicKeyBuffer = Buffer.from(publicKeyBase64, 'base64');

    // Verify signature using nacl.sign.detached.verify
    const isValid = nacl.sign.detached.verify(
      messageBuffer,
      signatureBuffer,
      publicKeyBuffer
    );

    return isValid;
  } catch {
    // Handle all errors gracefully: invalid base64, wrong key length, etc.
    return false;
  }
}

/**
 * Find matching artifact for current platform
 *
 * CONTRACT:
 *   Inputs:
 *     - artifacts: collection of ManifestArtifact objects
 *     - currentPlatform: platform identifier ('darwin' | 'linux' | 'win32')
 *
 *   Outputs:
 *     - ManifestArtifact object if found
 *     - undefined if no artifact matches platform
 *
 *   Invariants:
 *     - Returns first artifact matching currentPlatform
 *     - Platform comparison is case-sensitive exact match
 *
 *   Properties:
 *     - Deterministic: same inputs produce same output
 *     - Platform-specific: filters by artifact.platform field
 *
 *   Algorithm:
 *     1. Iterate through artifacts array
 *     2. For each artifact:
 *        a. If artifact.platform equals currentPlatform, return artifact
 *     3. If no match found, return undefined
 */
export function findArtifactForPlatform(
  artifacts: ManifestArtifact[],
  currentPlatform: 'darwin' | 'linux' | 'win32'
): ManifestArtifact | undefined {
  // TRIVIAL: Implemented directly
  return artifacts.find((a) => a.platform === currentPlatform);
}

/**
 * Verify complete manifest against downloaded file
 *
 * CONTRACT:
 *   Inputs:
 *     - manifest: SignedManifest object, must be fetched from trusted source
 *     - downloadedFilePath: absolute path to downloaded update artifact
 *     - currentVersion: current application version string (semver)
 *     - currentPlatform: platform identifier ('darwin' | 'linux' | 'win32')
 *     - publicKeyBase64: base64-encoded Ed25519 public key
 *
 *   Outputs:
 *     - promise resolving to: { verified: true } if all checks pass
 *     - promise rejecting with: Error containing reason if any check fails
 *
 *   Invariants:
 *     - All verification steps must pass (signature, version, platform, hash)
 *     - Verification order: signature → version → platform → hash
 *     - Short-circuit on first failure
 *
 *   Properties:
 *     - Security: rejects if ANY verification step fails
 *     - Completeness: checks all aspects (authenticity, version, platform, integrity)
 *     - Deterministic: same inputs produce same result
 *
 *   Algorithm:
 *     1. Verify manifest signature:
 *        a. Call verifySignature(manifest, publicKeyBase64)
 *        b. If false, reject with "Manifest signature verification failed"
 *     2. Validate manifest version:
 *        a. Call validateVersion(manifest.version, currentVersion)
 *        b. If not valid, reject with validation reason
 *     3. Find artifact for current platform:
 *        a. Call findArtifactForPlatform(manifest.artifacts, currentPlatform)
 *        b. If undefined, reject with "No artifact found for platform {platform}"
 *     4. Verify artifact hash:
 *        a. Compute hash: await hashFile(downloadedFilePath)
 *        b. Compare: hashMatches(artifact.sha256, computedHash)
 *        c. If false, reject with "Downloaded file hash mismatch"
 *     5. All checks passed:
 *        - Return { verified: true }
 *
 *   Error Conditions:
 *     - Invalid signature: reject with signature error
 *     - Invalid version: reject with version error
 *     - Platform not found: reject with platform error
 *     - Hash mismatch: reject with integrity error
 *     - File I/O error: propagate filesystem error
 */
export async function verifyManifest(
  manifest: SignedManifest,
  downloadedFilePath: string,
  currentVersion: string,
  currentPlatform: 'darwin' | 'linux' | 'win32',
  publicKeyBase64: string
): Promise<{ verified: true }> {
  // Step 1: Verify manifest signature
  const signatureValid = verifySignature(manifest, publicKeyBase64);
  if (!signatureValid) {
    throw new Error('Manifest signature verification failed');
  }

  // Step 2: Validate manifest version
  const versionResult = validateVersion(manifest.version, currentVersion);
  if (!versionResult.valid) {
    throw new Error(versionResult.reason);
  }

  // Step 3: Find artifact for current platform
  const artifact = findArtifactForPlatform(manifest.artifacts, currentPlatform);
  if (!artifact) {
    throw new Error(`No artifact found for platform ${currentPlatform}`);
  }

  // Step 4: Verify artifact hash
  const computedHash = await hashFile(downloadedFilePath);
  const hashValid = hashMatches(artifact.sha256, computedHash);
  if (!hashValid) {
    throw new Error('Downloaded file hash mismatch');
  }

  // Step 5: All checks passed
  return { verified: true };
}
