/**
 * Integration module for coordinating update verification flow
 *
 * This module integrates security verification with update management.
 * Coordinates manifest fetching, verification, and update state broadcasting.
 */

import { UpdateDownloadedEvent } from 'electron-updater';
import { SignedManifest, UpdateState } from '../shared/types';
import { verifyManifest } from './security/verify';

/**
 * Construct manifest URL from package.json publish config
 *
 * CONTRACT:
 *   Inputs:
 *     - publishConfig: object with fields:
 *       - owner: GitHub username or organization
 *       - repo: repository name
 *     - version: version string (e.g., "1.0.0")
 *     - manifestUrl: optional override URL (if provided, use instead of constructing)
 *
 *   Outputs:
 *     - string: manifest URL or error
 *     - throws Error if publishConfig incomplete and no manifestUrl provided
 *
 *   Invariants:
 *     - If manifestUrl provided, return it unchanged
 *     - Otherwise, construct from GitHub release pattern
 *     - URL format: https://github.com/{owner}/{repo}/releases/download/v{version}/manifest.json
 *
 *   Properties:
 *     - Override priority: manifestUrl takes precedence over constructed URL
 *     - GitHub convention: follows electron-updater GitHub provider pattern
 *
 *   Algorithm:
 *     1. If manifestUrl is defined and non-empty, return manifestUrl
 *     2. Validate publishConfig:
 *        - If owner missing or empty, throw Error("GitHub owner not configured")
 *        - If repo missing or empty, throw Error("GitHub repo not configured")
 *     3. Construct URL: `https://github.com/${owner}/${repo}/releases/download/v${version}/manifest.json`
 *     4. Return constructed URL
 *
 *   Examples:
 *     - constructManifestUrl({ owner: "user", repo: "app" }, "1.0.0", undefined)
 *       → "https://github.com/user/app/releases/download/v1.0.0/manifest.json"
 *     - constructManifestUrl({}, "1.0.0", "https://custom.com/manifest.json")
 *       → "https://custom.com/manifest.json"
 */
export function constructManifestUrl(
  publishConfig: { owner?: string; repo?: string },
  version: string,
  manifestUrl?: string
): string {
  // If manifestUrl is provided and non-empty, return it as-is
  if (manifestUrl) {
    return manifestUrl;
  }

  // Validate publishConfig
  const owner = publishConfig.owner?.trim();
  const repo = publishConfig.repo?.trim();

  if (!owner) {
    throw new Error('GitHub owner not configured');
  }

  if (!repo) {
    throw new Error('GitHub repo not configured');
  }

  // Ensure version starts with 'v'
  const versionTag = version.startsWith('v') ? version : `v${version}`;

  // Construct and return the URL
  return `https://github.com/${owner}/${repo}/releases/download/${versionTag}/manifest.json`;
}

/**
 * Fetch manifest from URL
 *
 * CONTRACT:
 *   Inputs:
 *     - manifestUrl: HTTPS URL to manifest.json
 *
 *   Outputs:
 *     - promise resolving to: SignedManifest object
 *     - promise rejecting with: Error if fetch fails or JSON invalid
 *
 *   Invariants:
 *     - Uses fetch API for HTTP request
 *     - Validates HTTP status is 2xx
 *     - Parses response as JSON
 *
 *   Properties:
 *     - Network-dependent: requires connectivity
 *     - Synchronous parsing: JSON parsed immediately after fetch
 *
 *   Algorithm:
 *     1. Fetch URL using fetch(manifestUrl)
 *     2. Check response.ok (status 2xx):
 *        - If not ok, throw Error(`Manifest request failed: ${response.status}`)
 *     3. Parse JSON: await response.json()
 *     4. Cast to SignedManifest (assumes correct schema)
 *     5. Return manifest
 *
 *   Error Conditions:
 *     - Network failure: reject with fetch error
 *     - HTTP error (4xx, 5xx): reject with status code
 *     - Invalid JSON: reject with parse error
 */
export async function fetchManifest(manifestUrl: string): Promise<SignedManifest> {
  validateManifestUrl(manifestUrl);

  const response = await fetch(manifestUrl, {
    headers: {
      'Cache-Control': 'no-cache',
    },
  });

  if (!response.ok) {
    throw new Error(`Manifest request failed with status ${response.status}`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (err) {
    throw new Error(
      `Failed to parse manifest JSON: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }

  validateManifestStructure(data);
  return data as SignedManifest;
}

function validateManifestUrl(url: string): void {
  try {
    const urlObj = new URL(url);
    if (urlObj.protocol !== 'https:') {
      throw new Error('Manifest URL must use HTTPS protocol');
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'Manifest URL must use HTTPS protocol') {
      throw err;
    }
    throw new Error(`Invalid manifest URL: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

function validateManifestStructure(data: unknown): void {
  if (!data || typeof data !== 'object') {
    throw new Error('Manifest must be a valid JSON object');
  }

  const manifest = data as Record<string, unknown>;

  const requiredFields = ['version', 'artifacts', 'signature', 'createdAt'];
  const missingFields = requiredFields.filter((field) => !(field in manifest));

  if (missingFields.length > 0) {
    throw new Error(`Missing required manifest fields: ${missingFields.join(', ')}`);
  }

  if (typeof manifest.version !== 'string') {
    throw new Error('Manifest field "version" must be a string');
  }

  if (!Array.isArray(manifest.artifacts)) {
    throw new Error('Manifest field "artifacts" must be an array');
  }

  if (typeof manifest.signature !== 'string') {
    throw new Error('Manifest field "signature" must be a string');
  }

  if (typeof manifest.createdAt !== 'string') {
    throw new Error('Manifest field "createdAt" must be a string');
  }
}

/**
 * Verify downloaded update (orchestrates full verification flow)
 *
 * CONTRACT:
 *   Inputs:
 *     - downloadEvent: UpdateDownloadedEvent from electron-updater
 *     - currentVersion: current app version string
 *     - currentPlatform: platform identifier ('darwin' | 'linux' | 'win32')
 *     - publicKeyBase64: Ed25519 public key (base64)
 *     - manifestUrl: URL to fetch manifest from
 *
 *   Outputs:
 *     - promise resolving to: { verified: true } if all checks pass
 *     - promise rejecting with: Error containing reason if any check fails
 *
 *   Invariants:
 *     - All verification steps must pass
 *     - Manifest fetched before verification
 *     - Downloaded file path extracted from event
 *
 *   Properties:
 *     - Completeness: fetches manifest and verifies all aspects
 *     - Delegation: uses verifyManifest for cryptographic checks
 *     - Logging: logs fetch and verification steps
 *
 *   Algorithm:
 *     1. Log: "Fetching manifest from {manifestUrl}"
 *     2. Fetch manifest: await fetchManifest(manifestUrl)
 *     3. Extract downloaded file path from downloadEvent
 *        - Try (downloadEvent as any).downloadedFile
 *        - Fallback to downloadEvent.downloadedFile
 *        - If missing, throw Error("Downloaded file path missing")
 *     4. Verify manifest: await verifyManifest(
 *          manifest,
 *          filePath,
 *          currentVersion,
 *          currentPlatform,
 *          publicKeyBase64
 *        )
 *     5. Log: "Manifest verified for version {manifest.version}"
 *     6. Return { verified: true }
 *
 *   Error Conditions:
 *     - Manifest fetch fails: propagate fetch error
 *     - File path missing: throw descriptive error
 *     - Verification fails: propagate verification error
 */
export async function verifyDownloadedUpdate(
  downloadEvent: UpdateDownloadedEvent,
  currentVersion: string,
  currentPlatform: 'darwin' | 'linux' | 'win32',
  publicKeyBase64: string,
  manifestUrl: string
): Promise<{ verified: true }> {
  // Step 1: Log fetch start
  console.log(`Fetching manifest from ${manifestUrl}`);

  // Step 2: Fetch manifest
  const manifest = await fetchManifest(manifestUrl);

  // Step 3: Extract downloaded file path from event
  const filePath =
    (downloadEvent as any).downloadedFile || downloadEvent.downloadedFile;

  if (!filePath) {
    throw new Error('Downloaded file path missing');
  }

  // Step 4: Verify manifest
  await verifyManifest(manifest, filePath, currentVersion, currentPlatform, publicKeyBase64);

  // Step 5: Log verification success
  console.log(`Manifest verified for version ${manifest.version}`);

  // Step 6: Return success
  return { verified: true };
}
