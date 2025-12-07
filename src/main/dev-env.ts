/**
 * Development environment detection and configuration
 *
 * Provides utilities for detecting dev mode and parsing dev-specific
 * environment variables for update testing.
 */

/**
 * Configuration for development mode update testing
 */
export interface DevUpdateConfig {
  forceDevUpdateConfig: boolean;
  devUpdateSource?: string;
  allowPrerelease: boolean;
}

/**
 * Check if application is running in development mode
 *
 * CONTRACT:
 *   Inputs:
 *     - none (reads VITE_DEV_SERVER_URL from process.env)
 *
 *   Outputs:
 *     - boolean: true if dev mode, false if production
 *
 *   Invariants:
 *     - Returns true if and only if VITE_DEV_SERVER_URL is defined and non-empty
 *     - Result is stable for a given process execution
 *
 *   Properties:
 *     - Deterministic: same environment produces same result
 *     - Side-effect free: does not modify environment
 *
 *   Algorithm:
 *     1. Read VITE_DEV_SERVER_URL from process.env
 *     2. Check if value is truthy (defined and non-empty string)
 *     3. Return boolean result
 */
export function isDevMode(): boolean {
  // TRIVIAL: Implemented directly
  return Boolean(process.env.VITE_DEV_SERVER_URL);
}

/**
 * Parse development mode update configuration from environment variables
 *
 * CONTRACT:
 *   Inputs:
 *     - none (reads from process.env):
 *       - FORCE_DEV_UPDATE_CONFIG: "true" or "false" (optional, defaults to false in production, true in dev if DEV_UPDATE_SOURCE set)
 *       - DEV_UPDATE_SOURCE: URL string (optional, can be GitHub URL or file:// path)
 *       - ALLOW_PRERELEASE: "true" or "false" (optional, defaults to false)
 *
 *   Outputs:
 *     - DevUpdateConfig object with fields:
 *       - forceDevUpdateConfig: boolean
 *       - devUpdateSource: string or undefined
 *       - allowPrerelease: boolean
 *
 *   Invariants:
 *     - In production mode (isDevMode() = false):
 *       - forceDevUpdateConfig always false (security constraint C1)
 *       - allowPrerelease always false (security constraint C1)
 *       - devUpdateSource always undefined
 *     - In dev mode (isDevMode() = true):
 *       - If DEV_UPDATE_SOURCE is set, forceDevUpdateConfig defaults to true
 *       - If FORCE_DEV_UPDATE_CONFIG explicitly set, use that value
 *       - allowPrerelease can be true only in dev mode
 *
 *   Properties:
 *     - Production safety: production builds never enable dev features
 *     - Fail-safe: invalid values treated as false/undefined
 *     - Convention over configuration: sensible defaults for common cases
 *
 *   Algorithm:
 *     1. Check if running in dev mode using isDevMode()
 *     2. If production mode:
 *        - Return all-false config (safety override)
 *     3. If dev mode:
 *        a. Parse DEV_UPDATE_SOURCE (trim whitespace, undefined if empty)
 *        b. Parse ALLOW_PRERELEASE (case-insensitive "true" = true, else false)
 *        c. Determine forceDevUpdateConfig:
 *           - If FORCE_DEV_UPDATE_CONFIG explicitly set, use that
 *           - Else if DEV_UPDATE_SOURCE is set, default to true
 *           - Else default to false
 *        d. Return DevUpdateConfig with parsed values
 *
 *   Examples:
 *     Production (VITE_DEV_SERVER_URL unset):
 *       - Any env vars → { forceDevUpdateConfig: false, devUpdateSource: undefined, allowPrerelease: false }
 *
 *     Dev mode (VITE_DEV_SERVER_URL = "http://localhost:5173"):
 *       - No env vars → { forceDevUpdateConfig: false, devUpdateSource: undefined, allowPrerelease: false }
 *       - DEV_UPDATE_SOURCE = "https://..." → { forceDevUpdateConfig: true, devUpdateSource: "https://...", allowPrerelease: false }
 *       - DEV_UPDATE_SOURCE + ALLOW_PRERELEASE = "true" → { forceDevUpdateConfig: true, devUpdateSource: "...", allowPrerelease: true }
 *       - FORCE_DEV_UPDATE_CONFIG = "false" + DEV_UPDATE_SOURCE → { forceDevUpdateConfig: false, devUpdateSource: "...", allowPrerelease: false }
 */
export function getDevUpdateConfig(): DevUpdateConfig {
  // TRIVIAL: Implemented directly
  const devMode = isDevMode();

  // Production safety: always return safe config in production
  if (!devMode) {
    return {
      forceDevUpdateConfig: false,
      devUpdateSource: undefined,
      allowPrerelease: false,
    };
  }

  // Dev mode: parse environment variables
  const devUpdateSource = process.env.DEV_UPDATE_SOURCE?.trim() || undefined;
  const allowPrerelease = process.env.ALLOW_PRERELEASE?.toLowerCase() === 'true';

  // Determine forceDevUpdateConfig with smart defaults
  let forceDevUpdateConfig = false;
  if (process.env.FORCE_DEV_UPDATE_CONFIG !== undefined) {
    // Explicit configuration takes precedence
    forceDevUpdateConfig = process.env.FORCE_DEV_UPDATE_CONFIG.toLowerCase() === 'true';
  } else if (devUpdateSource) {
    // If update source is configured, enable dev updates by default
    forceDevUpdateConfig = true;
  }

  return {
    forceDevUpdateConfig,
    devUpdateSource,
    allowPrerelease,
  };
}
