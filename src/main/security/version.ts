/**
 * GAP-006: Version comparison using semver
 *
 * This module validates manifest versions against current app version.
 * Ensures updates follow semantic versioning and prevents downgrades.
 */

import semver from 'semver';

/**
 * Validate that manifest version is newer than current version
 *
 * CONTRACT:
 *   Inputs:
 *     - manifestVersion: version string, semver format (e.g., "1.2.3", "2.0.0-beta.1")
 *     - currentVersion: version string, semver format, current application version
 *
 *   Outputs:
 *     - object with fields:
 *       - valid: boolean, true if manifest version is strictly greater than current
 *       - reason: string (if invalid), human-readable explanation of rejection
 *
 *   Invariants:
 *     - Valid version format required for both inputs
 *     - Manifest version must be strictly greater (not equal, not less)
 *     - Follows semantic versioning rules (major.minor.patch)
 *
 *   Properties:
 *     - Anti-reflexive: validateVersion(v, v).valid is always false (equal versions rejected)
 *     - Transitive: if v1 > v2 and v2 > v3, then v1 > v3
 *     - Monotonic: only newer versions accepted
 *
 *   Algorithm:
 *     1. Validate manifestVersion is valid semver string:
 *        - If invalid, return { valid: false, reason: "Invalid manifest version format: {version}" }
 *     2. Validate currentVersion is valid semver string:
 *        - If invalid, return { valid: false, reason: "Invalid current version format: {version}" }
 *     3. Compare versions using semver.gt(manifestVersion, currentVersion):
 *        - If manifestVersion > currentVersion, return { valid: true }
 *        - If manifestVersion equals currentVersion, return { valid: false, reason: "Manifest version {v} equals current version" }
 *        - If manifestVersion < currentVersion, return { valid: false, reason: "Manifest version {v1} is older than current version {v2}" }
 *
 *   Examples:
 *     - validateVersion("2.0.0", "1.0.0") → { valid: true }
 *     - validateVersion("1.0.0", "1.0.0") → { valid: false, reason: "equals current" }
 *     - validateVersion("0.9.0", "1.0.0") → { valid: false, reason: "older" }
 *     - validateVersion("invalid", "1.0.0") → { valid: false, reason: "invalid format" }
 */
export function validateVersion(
  manifestVersion: string,
  currentVersion: string
): { valid: true } | { valid: false; reason: string } {
  // Validate manifestVersion is valid semver
  if (!semver.valid(manifestVersion)) {
    return {
      valid: false,
      reason: `Invalid manifest version format: ${manifestVersion}`,
    };
  }

  // Validate currentVersion is valid semver
  if (!semver.valid(currentVersion)) {
    return {
      valid: false,
      reason: `Invalid current version format: ${currentVersion}`,
    };
  }

  // Compare versions using semver.gt()
  if (semver.gt(manifestVersion, currentVersion)) {
    return { valid: true };
  }

  // Check if equal
  if (semver.eq(manifestVersion, currentVersion)) {
    return {
      valid: false,
      reason: `Manifest version ${manifestVersion} equals current version`,
    };
  }

  // manifestVersion < currentVersion
  return {
    valid: false,
    reason: `Manifest version ${manifestVersion} is older than current version ${currentVersion}`,
  };
}
