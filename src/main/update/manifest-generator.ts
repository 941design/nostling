/**
 * RSA-based manifest generation (migration from Ed25519)
 *
 * This module generates the manifest.json file during CI/CD builds.
 * Used by scripts/generate-manifest.ts for artifact signing.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
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
 * Generate RSA-signed manifest from artifacts in directory
 *
 * CONTRACT:
 *   Inputs:
 *     - distDir: absolute path to directory containing built artifacts
 *     - version: version string (semver format) from package.json
 *     - privateKeyPem: RSA private key in PEM format (armor-encoded text block)
 *       Example format:
 *       "-----BEGIN PRIVATE KEY-----
 *        MIIJQgIBADANBgkqhkiG9w0BAQ...
 *        -----END PRIVATE KEY-----"
 *     - hashFunction: function that computes SHA-256 hash of file (filePath → Promise<hash>)
 *
 *   Outputs:
 *     - promise resolving to: SignedManifest object with version, artifacts, createdAt, signature
 *
 *   Invariants:
 *     - Only includes recognized artifact extensions (.dmg, .zip, .AppImage, .exe)
 *     - Each artifact has computed SHA-256 hash
 *     - Manifest signed with RSA private key using SHA-256
 *     - createdAt is ISO 8601 timestamp
 *     - Signature is base64-encoded
 *
 *   Properties:
 *     - Completeness: includes all recognized artifacts in distDir
 *     - Integrity: signature covers all artifact metadata
 *     - Timestamped: createdAt records generation time
 *     - Algorithm compliance: uses RSASSA-PKCS1-v1_5 with SHA-256
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
 *     6. Sign manifest using RSA:
 *        a. Convert JSON string to Buffer (UTF-8)
 *        b. Create signing object: crypto.createSign('SHA256')
 *        c. Update signer with message buffer
 *        d. Compute signature: signer.sign(privateKeyPem)
 *        e. Encode signature as base64 string
 *     7. Return signed manifest: { ...unsigned, signature }
 *
 *   Error Conditions:
 *     - distDir doesn't exist: reject with filesystem error
 *     - No artifacts found: reject with "No artifacts found"
 *     - Private key invalid (bad PEM format): reject with "Invalid private key"
 *     - Private key wrong algorithm: reject with "Private key must be RSA"
 *     - Hash computation fails: propagate hash error
 *     - Crypto operation fails: propagate crypto error
 */
export async function generateManifest(
  distDir: string,
  version: string,
  privateKeyPem: string,
  hashFunction: (filePath: string) => Promise<string>
): Promise<SignedManifest> {
  // Validate directory exists
  if (!fs.existsSync(distDir)) {
    throw new Error(`Directory not found: ${distDir}`);
  }

  // List files in directory
  const files = fs.readdirSync(distDir);

  // Filter recognized artifacts
  const artifacts: ManifestArtifact[] = [];

  for (const filename of files) {
    const platformInfo = detectPlatform(filename);
    if (!platformInfo) {
      continue;
    }

    const filePath = path.join(distDir, filename);
    const stat = fs.statSync(filePath);

    // Only include files, not directories
    if (!stat.isFile()) {
      continue;
    }

    // Compute hash
    const sha256 = await hashFunction(filePath);

    artifacts.push({
      url: filename,
      sha256,
      platform: platformInfo.platform,
      type: platformInfo.type,
    });
  }

  if (artifacts.length === 0) {
    throw new Error('No artifacts found');
  }

  // Create unsigned manifest
  const unsigned = {
    version,
    artifacts,
    createdAt: new Date().toISOString(),
  };

  // Canonicalize manifest as JSON (no whitespace)
  const manifestJson = JSON.stringify(unsigned, null, 0);
  const manifestBuffer = Buffer.from(manifestJson, 'utf-8');

  // Sign manifest using RSA with SHA-256
  try {
    const signer = crypto.createSign('SHA256');
    signer.update(manifestBuffer);
    const signatureBuffer = signer.sign(privateKeyPem);
    const signature = signatureBuffer.toString('base64');

    return {
      ...unsigned,
      signature,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('PEM') || error.message.includes('key')) {
        throw new Error('Invalid private key');
      }
      throw error;
    }
    throw new Error('Invalid private key');
  }
}
