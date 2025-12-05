/**
 * GAP-001, GAP-008: Generate signed manifest with SHA-256 hashes and artifact metadata
 *
 * This module generates the manifest.json file during CI/CD builds.
 * Used by scripts/generate-manifest.ts for artifact signing.
 */

import fs from 'fs';
import path from 'path';
import nacl from 'tweetnacl';
import { SignedManifest, ManifestArtifact } from '../../shared/types';

/**
 * Detect platform and type from artifact filename
 *
 * CONTRACT:
 *   Inputs:
 *     - filename: string, artifact filename (e.g., "SlimChat-1.0.0.dmg", "SlimChat-1.0.0-x64.AppImage")
 *
 *   Outputs:
 *     - object with fields:
 *       - platform: 'darwin' | 'linux' | 'win32'
 *       - type: 'dmg' | 'zip' | 'AppImage' | 'exe'
 *     - undefined if filename doesn't match known patterns
 *
 *   Invariants:
 *     - Extension determines both platform and type
 *     - Case-insensitive matching
 *
 *   Properties:
 *     - Deterministic: same filename produces same result
 *     - Extension-based: uses file extension for detection
 *
 *   Algorithm:
 *     1. Extract file extension from filename (lowercase)
 *     2. Match extension to platform/type:
 *        - ".dmg" → { platform: 'darwin', type: 'dmg' }
 *        - ".zip" → { platform: 'darwin', type: 'zip' } (macOS uses zip for updates)
 *        - ".AppImage" → { platform: 'linux', type: 'AppImage' }
 *        - ".exe" → { platform: 'win32', type: 'exe' }
 *        - no match → return undefined
 *     3. Return matched platform/type object
 *
 *   Examples:
 *     - detectPlatform("SlimChat-1.0.0.dmg") → { platform: 'darwin', type: 'dmg' }
 *     - detectPlatform("SlimChat-1.0.0-x64.AppImage") → { platform: 'linux', type: 'AppImage' }
 *     - detectPlatform("unknown.txt") → undefined
 */
export function detectPlatform(
  filename: string
): { platform: 'darwin' | 'linux' | 'win32'; type: 'dmg' | 'zip' | 'AppImage' | 'exe' } | undefined {
  const lowerFilename = filename.toLowerCase();

  if (lowerFilename.endsWith('.dmg')) {
    return { platform: 'darwin', type: 'dmg' };
  }

  if (lowerFilename.endsWith('.zip')) {
    return { platform: 'darwin', type: 'zip' };
  }

  if (lowerFilename.endsWith('.appimage')) {
    return { platform: 'linux', type: 'AppImage' };
  }

  if (lowerFilename.endsWith('.exe')) {
    return { platform: 'win32', type: 'exe' };
  }

  return undefined;
}

/**
 * Generate manifest from artifacts in directory
 *
 * CONTRACT:
 *   Inputs:
 *     - distDir: absolute path to directory containing built artifacts
 *     - version: version string (semver format) from package.json
 *     - privateKeyBase64: base64-encoded Ed25519 private key (64 bytes → ~88 base64 chars)
 *     - hashFunction: function that computes SHA-256 hash of file (filePath → Promise<hash>)
 *
 *   Outputs:
 *     - promise resolving to: SignedManifest object with version, artifacts, createdAt, signature
 *
 *   Invariants:
 *     - Only includes recognized artifact extensions (.dmg, .zip, .AppImage, .exe)
 *     - Each artifact has computed SHA-256 hash
 *     - Manifest signed with Ed25519 private key
 *     - createdAt is ISO 8601 timestamp
 *
 *   Properties:
 *     - Completeness: includes all recognized artifacts in distDir
 *     - Integrity: signature covers all artifact metadata
 *     - Timestamped: createdAt records generation time
 *
 *   Algorithm:
 *     1. List all files in distDir
 *     2. Filter files by recognized extensions (.dmg, .zip, .AppImage, .exe)
 *     3. For each recognized artifact:
 *        a. Detect platform and type from filename
 *        b. Compute SHA-256 hash using hashFunction
 *        c. Create ManifestArtifact: { url: filename, sha256: hash, platform, type }
 *     4. Create unsigned manifest object:
 *        - version: from input
 *        - artifacts: array of ManifestArtifact objects
 *        - createdAt: new Date().toISOString()
 *     5. Canonicalize manifest as JSON (no whitespace)
 *     6. Sign manifest:
 *        a. Convert JSON to Buffer
 *        b. Decode private key from base64
 *        c. Compute signature: nacl.sign.detached(message, privateKey)
 *        d. Encode signature as base64
 *     7. Return signed manifest: { ...unsigned, signature }
 *
 *   Error Conditions:
 *     - distDir doesn't exist: reject with filesystem error
 *     - No artifacts found: reject with "No artifacts found"
 *     - Private key invalid: reject with "Invalid private key"
 *     - Hash computation fails: propagate hash error
 */
export async function generateManifest(
  distDir: string,
  version: string,
  privateKeyBase64: string,
  hashFunction: (filePath: string) => Promise<string>
): Promise<SignedManifest> {
  const files = fs.readdirSync(distDir);

  const artifacts: ManifestArtifact[] = [];

  for (const filename of files) {
    const platformInfo = detectPlatform(filename);
    if (!platformInfo) {
      continue;
    }

    const filePath = path.join(distDir, filename);
    const stats = fs.statSync(filePath);
    const sha256 = await hashFunction(filePath);

    artifacts.push({
      url: filename,
      sha256,
      platform: platformInfo.platform,
      type: platformInfo.type,
    });
  }

  const unsigned = {
    version,
    artifacts,
    createdAt: new Date().toISOString(),
  };

  const message = Buffer.from(JSON.stringify(unsigned, null, 0), 'utf-8');

  let privateKey: Uint8Array;
  try {
    const decoded = Buffer.from(privateKeyBase64, 'base64');
    if (decoded.length !== 64) {
      throw new Error('Invalid private key length');
    }
    privateKey = new Uint8Array(decoded);
  } catch (error) {
    throw new Error('Invalid private key');
  }

  const signature = nacl.sign.detached(message, privateKey);
  const signatureBase64 = Buffer.from(signature).toString('base64');

  return {
    ...unsigned,
    signature: signatureBase64,
  };
}
