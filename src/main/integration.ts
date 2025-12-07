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
 * Construct manifest URL for update verification
 *
 * CONTRACT:
 *   Inputs:
 *     - publishConfig: object with optional fields:
 *       - owner: GitHub username or organization
 *       - repo: repository name
 *     - devUpdateSource: optional string (dev mode override URL)
 *
 *   Outputs:
 *     - string: manifest URL
 *     - throws Error if publishConfig incomplete and no devUpdateSource
 *
 *   Invariants:
 *     - Production: always uses /latest/download/ path (cross-version discovery)
 *     - Dev mode: derives URL from devUpdateSource
 *     - URL format matches electron-updater GitHub provider expectations
 *
 *   Properties:
 *     - Cross-version discovery: production URL independent of current version
 *     - Dev mode flexibility: supports custom URLs including file://
 *     - GitHub convention: follows electron-updater GitHub provider pattern
 *
 *   Algorithm:
 *     1. If devUpdateSource is defined and non-empty:
 *        a. If devUpdateSource ends with '/':
 *           - Return devUpdateSource + 'manifest.json'
 *        b. Else:
 *           - Return devUpdateSource + '/manifest.json'
 *
 *     2. Validate publishConfig (production mode):
 *        a. Extract owner = publishConfig.owner?.trim()
 *        b. Extract repo = publishConfig.repo?.trim()
 *        c. If owner is empty or undefined, throw Error("GitHub owner not configured")
 *        d. If repo is empty or undefined, throw Error("GitHub repo not configured")
 *
 *     3. Construct production URL:
 *        - Return `https://github.com/${owner}/${repo}/releases/latest/download/manifest.json`
 *        - NOTE: /latest/download/ path (NOT version-specific)
 *
 *   Examples:
 *     Production mode:
 *       constructManifestUrl({ owner: "941design", repo: "slim-chat" }, undefined)
 *       → "https://github.com/941design/slim-chat/releases/latest/download/manifest.json"
 *
 *     Dev mode with GitHub release:
 *       constructManifestUrl({}, "https://github.com/941design/slim-chat/releases/download/v1.0.0")
 *       → "https://github.com/941design/slim-chat/releases/download/v1.0.0/manifest.json"
 *
 *     Dev mode with local file:
 *       constructManifestUrl({}, "file://./test-manifests/v1.0.0")
 *       → "file://./test-manifests/v1.0.0/manifest.json"
 */
export function constructManifestUrl(
  publishConfig: { owner?: string; repo?: string },
  devUpdateSource?: string
): string {
  // Dev mode: use devUpdateSource as base URL
  if (devUpdateSource) {
    if (devUpdateSource.endsWith('/')) {
      return devUpdateSource + 'manifest.json';
    } else {
      return devUpdateSource + '/manifest.json';
    }
  }

  // Production mode: validate publishConfig and construct URL
  const owner = publishConfig.owner?.trim();
  const repo = publishConfig.repo?.trim();

  if (!owner) {
    throw new Error('GitHub owner not configured');
  }

  if (!repo) {
    throw new Error('GitHub repo not configured');
  }

  // Production: use /latest/download/ for cross-version discovery
  return `https://github.com/${owner}/${repo}/releases/latest/download/manifest.json`;
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
export async function fetchManifest(
  manifestUrl: string,
  timeoutMs: number = 30000
): Promise<SignedManifest> {
  validateManifestUrl(manifestUrl);

  // CRITICAL: Timeout mechanism to prevent indefinite hangs (FR4)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(manifestUrl, {
      headers: {
        'Cache-Control': 'no-cache',
      },
      signal: controller.signal,
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
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Manifest fetch timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
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
 *     - publicKeyPem: RSA public key in PEM format
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
 *          publicKeyPem
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
  publicKeyPem: string,
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
  await verifyManifest(manifest, filePath, currentVersion, currentPlatform, publicKeyPem);

  // Step 5: Log verification success
  console.log(`Manifest verified for version ${manifest.version}`);

  // Step 6: Return success
  return { verified: true };
}
