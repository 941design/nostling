/**
 * RSA-based manifest verification (migration from Ed25519)
 *
 * This module verifies downloaded update artifacts against RSA-signed manifests.
 * Security-critical: all cryptographic operations must succeed before accepting updates.
 */

import crypto from 'crypto';
import { SignedManifest, ManifestArtifact } from '../../shared/types';
import { hashFile, hashMatches } from './crypto';
import { validateVersion } from './version';
import { log } from '../logging';

/**
 * Verify RSA signature on manifest
 *
 * CONTRACT:
 *   Inputs:
 *     - manifest: SignedManifest object with version, artifacts, createdAt, signature fields
 *     - publicKeyPem: RSA public key in PEM format (armor-encoded text block)
 *       Example format:
 *       "-----BEGIN PUBLIC KEY-----
 *        MIICIjANBgkqhkiG9w0BAQ...
 *        -----END PUBLIC KEY-----"
 *
 *   Outputs:
 *     - boolean: true if signature valid, false otherwise
 *
 *   Invariants:
 *     - Signature covers canonical JSON of { version, artifacts, createdAt }
 *     - Public key must be valid RSA key in PEM format
 *     - Signature must be base64-encoded RSA signature bytes
 *     - Uses SHA-256 hash algorithm for RSA signing
 *
 *   Properties:
 *     - Authenticity: only private key holder can produce valid signature
 *     - Integrity: any modification to version/artifacts/createdAt invalidates signature
 *     - Deterministic: same manifest + key produces same verification result
 *     - Algorithm compliance: uses RSASSA-PKCS1-v1_5 with SHA-256 (standard)
 *
 *   Algorithm:
 *     1. Extract payload: { version, artifacts, createdAt } from manifest
 *     2. Canonicalize payload as JSON string (no whitespace)
 *     3. Convert payload string to Buffer (UTF-8 encoding)
 *     4. Decode signature from manifest.signature (base64 → Buffer)
 *     5. Create verification object: crypto.createVerify('SHA256')
 *     6. Update verifier with payload buffer
 *     7. Verify signature using verifier.verify(publicKeyPem, signatureBuffer)
 *     8. Return verification result (boolean)
 *
 *   Error Conditions:
 *     - Invalid base64 encoding in signature: return false
 *     - Invalid PEM format in public key: return false
 *     - Signature algorithm mismatch: return false
 *     - Any crypto operation error: return false (graceful failure)
 */
export function verifySignature(
  manifest: SignedManifest,
  publicKeyPem: string
): boolean {
  try {
    const payload = {
      version: manifest.version,
      artifacts: manifest.artifacts,
      createdAt: manifest.createdAt,
    };

    const payloadString = JSON.stringify(payload, null, 0);
    const payloadBuffer = Buffer.from(payloadString, 'utf-8');

    const signatureBuffer = Buffer.from(manifest.signature, 'base64');

    const verifier = crypto.createVerify('SHA256');
    verifier.update(payloadBuffer);

    return verifier.verify(publicKeyPem, signatureBuffer);
  } catch {
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
 *     - publicKeyPem: RSA public key in PEM format
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
 *        a. Call verifySignature(manifest, publicKeyPem)
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
  publicKeyPem: string
): Promise<{ verified: true }> {
  log('info', `Verifying manifest: version=${manifest.version}, platform=${currentPlatform}, currentVersion=${currentVersion}`);

  if (!verifySignature(manifest, publicKeyPem)) {
    log('error', 'Signature verification failed - manifest may be tampered or signed with different key');
    throw new Error('Manifest signature verification failed');
  }
  log('info', 'Signature verification passed');

  const versionResult = validateVersion(manifest.version, currentVersion);
  if (!versionResult.valid) {
    log('error', `Version validation failed: ${versionResult.reason}`);
    throw new Error(versionResult.reason);
  }
  log('info', 'Version validation passed');

  const artifact = findArtifactForPlatform(manifest.artifacts, currentPlatform);
  if (!artifact) {
    log('error', `No artifact found for platform ${currentPlatform}, available: ${manifest.artifacts.map(a => a.platform).join(', ')}`);
    throw new Error(`No artifact found for platform ${currentPlatform}`);
  }
  log('info', `Found artifact for platform: ${artifact.platform}, expected hash: ${artifact.sha256.substring(0, 16)}...`);

  const computedHash = await hashFile(downloadedFilePath);
  if (!hashMatches(artifact.sha256, computedHash)) {
    log('error', `Hash mismatch - expected: ${artifact.sha256.substring(0, 16)}..., computed: ${computedHash.substring(0, 16)}...`);
    throw new Error('Downloaded file hash mismatch');
  }
  log('info', 'File hash verification passed');

  return { verified: true };
}
