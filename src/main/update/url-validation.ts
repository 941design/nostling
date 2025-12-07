/**
 * Shared URL validation utilities for update system
 *
 * Provides centralized URL validation to eliminate duplication
 * between manifest URL validation and feed URL validation.
 */

/**
 * Validate update URL protocol and format
 *
 * CONTRACT:
 *   Inputs:
 *     - url: string URL to validate
 *     - options: object with optional fields:
 *       - allowFileProtocol: boolean (default: false) - allow file:// in dev mode
 *       - allowHttp: boolean (default: false) - allow http:// in dev mode
 *       - context: string (for error messages, e.g., "manifest URL", "feed URL")
 *
 *   Outputs:
 *     - void if URL is valid
 *     - throws Error if URL is invalid or protocol disallowed
 *
 *   Invariants:
 *     - https:// always allowed
 *     - file:// only allowed when allowFileProtocol = true
 *     - http:// only allowed when allowHttp = true
 *     - Malformed URLs always rejected
 *     - Empty/whitespace-only URLs rejected
 *
 *   Properties:
 *     - Security: production-safe defaults (HTTPS-only)
 *     - Flexibility: dev mode allows file:// and http:// when explicitly enabled
 *     - Fail-fast: throws immediately on invalid input
 *     - Context-aware: error messages include context for better debugging
 *
 *   Algorithm:
 *     1. Trim and validate non-empty:
 *        - Trim whitespace from url
 *        - If empty after trim, throw "{context} cannot be empty"
 *
 *     2. Parse URL using URL constructor:
 *        - Try to parse, catch and re-throw with context
 *
 *     3. Extract protocol and validate:
 *        a. If protocol is 'https:':
 *           - Valid (return success)
 *        b. If protocol is 'file:':
 *           - If allowFileProtocol is true → success
 *           - Else throw "{context} must use HTTPS protocol"
 *        c. If protocol is 'http:':
 *           - If allowHttp is true → success
 *           - Else throw "{context} must use HTTPS protocol"
 *        d. Otherwise (ftp:, etc.):
 *           - throw "Invalid {context}: unsupported protocol \"{protocol}\" (valid: https:, ...)"
 *
 *   Examples:
 *     Production mode (all flags false):
 *       validateUpdateUrl("https://github.com/owner/repo", {}) → void (success)
 *       validateUpdateUrl("file:///tmp/manifest.json", {}) → Error
 *       validateUpdateUrl("http://example.com", {}) → Error
 *
 *     Dev mode with file protocol:
 *       validateUpdateUrl("file:///tmp/manifest.json", { allowFileProtocol: true }) → void
 *       validateUpdateUrl("https://github.com/...", { allowFileProtocol: true }) → void
 *
 *     Dev mode with http:
 *       validateUpdateUrl("http://localhost:8080/updates", { allowHttp: true }) → void
 *
 *   Error Conditions:
 *     - Empty URL: "{context} cannot be empty"
 *     - Malformed URL: "Invalid {context}: {parse error}"
 *     - Disallowed protocol: "{context} must use HTTPS protocol"
 *     - Unsupported protocol: "Invalid {context}: unsupported protocol \"{protocol}\""
 */
export function validateUpdateUrl(
  url: string,
  options: {
    allowFileProtocol?: boolean;
    allowHttp?: boolean;
    context?: string;
  } = {}
): void {
  const { allowFileProtocol = false, allowHttp = false, context = 'URL' } = options;

  // Step 1: Trim and validate non-empty
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    throw new Error(`${context} cannot be empty`);
  }

  // Step 2: Parse URL
  let urlObj: URL;
  try {
    urlObj = new URL(trimmedUrl);
  } catch (err) {
    throw new Error(`Invalid ${context}: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Step 3: Validate protocol
  const protocol = urlObj.protocol;

  if (protocol === 'https:') {
    return; // Always valid
  }

  if (protocol === 'file:' && allowFileProtocol) {
    return; // Valid in dev mode with file protocol enabled
  }

  if (protocol === 'http:' && allowHttp) {
    return; // Valid in dev mode with http enabled
  }

  // Protocol not allowed - determine appropriate error message
  if (protocol === 'file:' || protocol === 'http:') {
    throw new Error(`${context} must use HTTPS protocol`);
  }

  // Unsupported protocol
  const validProtocols = ['https:'];
  if (allowHttp) validProtocols.push('http:');
  if (allowFileProtocol) validProtocols.push('file:');

  throw new Error(
    `Invalid ${context}: unsupported protocol "${protocol}" (valid: ${validProtocols.join(', ')})`
  );
}
