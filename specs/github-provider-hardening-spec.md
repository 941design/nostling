# GitHub Provider Hardening - Requirements Specification

## Problem Statement

The GitHub Provider Auto-Update feature has been implemented and the critical production safety vulnerability has been fixed. However, the system verification phase identified several high and medium priority improvements related to concurrency protection, specification compliance, test coverage, code quality, and error handling that should be addressed to harden the implementation.

This specification addresses all remaining recommendations from the system-verifier report.

## Core Functionality

Harden the GitHub Provider Auto-Update implementation with:
1. Concurrency protection for download operations
2. File protocol support for dev mode testing (per FR2)
3. Enhanced test coverage for edge cases and E2E scenarios
4. Error message sanitization for production security
5. Configuration validation for fail-fast behavior
6. Code quality improvements (DRY, dead code removal)

---

## Functional Requirements

### FR1: Download Concurrency Protection (IC2)
- **Requirement**: Prevent race conditions from multiple simultaneous download calls
- **Acceptance Criteria**:
  - `downloadUpdate()` includes a concurrency guard similar to `checkForUpdates()`
  - Second concurrent call to `downloadUpdate()` is rejected with clear error
  - Guard is released after download completes (success or failure)
  - State machine correctly tracks `downloading` phase
- **Priority**: HIGH

### FR2: File Protocol Support for Dev Mode (IC3)
- **Requirement**: Allow file:// URLs in dev mode for local testing (specification FR2 compliance)
- **Acceptance Criteria**:
  - `fetchManifest()` accepts optional parameter to allow file:// protocol
  - File protocol only allowed when explicitly enabled (dev mode)
  - Production builds still enforce HTTPS-only
  - `validateManifestUrl()` updated to accept dev mode flag
  - Call site in `index.ts` passes dev mode flag based on `devConfig.devUpdateSource`
- **Priority**: HIGH

### FR3: URL Validation Before setFeedURL (IC5)
- **Requirement**: Validate devUpdateSource URL format at setup time, not runtime
- **Acceptance Criteria**:
  - Invalid URLs (malformed, empty after trim) rejected during `setupUpdater()`
  - Clear error message logged indicating configuration problem
  - Fail-fast behavior prevents silent failures during update checks
  - Valid URL formats: https://, http:// (dev only), file:// (dev only)
- **Priority**: MEDIUM

### FR4: Error Message Sanitization (IC4)
- **Requirement**: Prevent internal implementation details from leaking in error messages
- **Acceptance Criteria**:
  - HTTP status codes shown generically (e.g., "HTTP error" not "HTTP 404")
  - JSON parse errors sanitized (e.g., "Invalid format" not parser details)
  - Manifest field names not exposed (e.g., "Validation failed" not field list)
  - Dev mode can optionally show verbose errors for debugging
  - Production errors are user-friendly and non-technical
- **Priority**: MEDIUM

### FR5: GitHub Constants Extraction (IC6)
- **Requirement**: Extract hardcoded GitHub owner/repo to shared constants
- **Acceptance Criteria**:
  - Constants `GITHUB_OWNER` and `GITHUB_REPO` defined in single location
  - Used in `controller.ts` (setFeedURL) and `index.ts` (publishConfig)
  - Single source of truth prevents drift if owner/repo changes
  - Constants exported for potential use in tests
- **Priority**: LOW

### FR6: Dead Code Removal (IC7)
- **Requirement**: Remove unused imports identified during verification
- **Acceptance Criteria**:
  - Remove `UpdateState` import from `src/main/integration.ts`
  - Remove unused `UpdateState` import from `src/main/update/controller.ts` (verify usage first)
  - Verify `app` import in controller.ts is actually unused before removing
  - TypeScript compilation succeeds after removals
- **Priority**: LOW

---

## Test Requirements

### TR1: End-to-End Version Transition Test (TC1)
- **Requirement**: Verify old app versions can update to new GitHub provider version
- **Acceptance Criteria**:
  - E2E test simulates app v0.0.0 with old provider behavior
  - Test triggers complete update flow: check → discover → download → verify
  - Test simulates app restart as v0.0.1 with new GitHub provider
  - Subsequent update checks from new version work correctly
  - Validates specification constraint C2 (Backward Compatibility)
- **Priority**: HIGH
- **Test File**: `src/main/update/update-transition.e2e.test.ts`

### TR2: Explicit Dev Mode Pattern Tests (TC2)
- **Requirement**: Add deterministic tests for all 8 dev mode activation patterns
- **Acceptance Criteria**:
  - Explicit test for: devSource only (no force, no prerelease)
  - Explicit test for: allowPrerelease only (no force, no source)
  - Explicit test for: forceDevUpdateConfig + allowPrerelease (no source)
  - Explicit test for: devUpdateSource + allowPrerelease (no force)
  - All 8 patterns have deterministic coverage (not just probabilistic via PBT)
- **Priority**: HIGH
- **Test File**: `src/main/update/controller.test.ts`

### TR3: Production Safety Bypass Regression Test (TC3)
- **Requirement**: Prevent regression of critical security fix IC1
- **Acceptance Criteria**:
  - Test sets `VITE_DEV_SERVER_URL=undefined` (production mode)
  - Test sets `DEV_UPDATE_SOURCE=https://evil.com/malicious`
  - Test verifies manifest URL uses GitHub, not attacker URL
  - Test documents the security invariant being protected
- **Priority**: HIGH
- **Test File**: `src/main/index.test.ts`

### TR4: Download Concurrency Test (RP3)
- **Requirement**: Verify concurrent download protection works
- **Acceptance Criteria**:
  - Test calls `downloadUpdate()` twice in parallel
  - First call proceeds normally
  - Second call throws "Download already in progress" error
  - Guard released after first call completes
- **Priority**: HIGH
- **Test File**: `src/main/update/controller.test.ts`

### TR5: File Protocol Dev Mode Test (RP2)
- **Requirement**: Verify file:// URLs work in dev mode
- **Acceptance Criteria**:
  - Test enables dev mode via `VITE_DEV_SERVER_URL`
  - Test sets `DEV_UPDATE_SOURCE=file:///tmp/test-updates`
  - `fetchManifest()` with `allowFileProtocol=true` succeeds
  - Production mode (no dev server URL) still rejects file://
- **Priority**: HIGH
- **Test File**: `src/main/integration.test.ts`

---

## Critical Constraints

### C1: No Regressions
- All existing 307 tests must continue to pass
- Production safety constraints (from parent spec C1) must be maintained
- Backward compatibility (from parent spec C2) must be preserved

### C2: Security First
- Error sanitization must not hide security-relevant information from logs
- File protocol support must ONLY work in verified dev mode
- Concurrency protection must not introduce deadlocks

### C3: Minimal Changes
- Changes should be surgical and focused on specific recommendations
- Avoid scope creep or unnecessary refactoring
- Each fix should be independently testable

---

## Integration Points

### INT1: Download Concurrency (FR1)
- **File**: `src/main/update/controller.ts`
- **Function**: `downloadUpdate()` (lines 271-274)
- **Change**: Add download-in-progress guard with try/finally cleanup

### INT2: File Protocol Support (FR2)
- **File**: `src/main/integration.ts`
- **Functions**:
  - `fetchManifest()` (lines 128-169) - add `allowFileProtocol` parameter
  - `validateManifestUrl()` (lines 171-183) - accept dev mode flag
- **File**: `src/main/index.ts`
- **Location**: update-downloaded handler (lines 98-100)
- **Change**: Pass `allowFileProtocol: Boolean(devConfig.devUpdateSource)` to fetchManifest

### INT3: URL Validation (FR3)
- **File**: `src/main/update/controller.ts`
- **Function**: `setupUpdater()` (lines 224-230)
- **Change**: Add URL format validation before setFeedURL call

### INT4: Error Sanitization (FR4)
- **File**: `src/main/integration.ts`
- **Functions**:
  - `fetchManifest()` (lines 146-157) - sanitize HTTP and parse errors
  - `validateManifestFields()` (lines 185-214) - sanitize field validation errors
- **Optional**: Add `sanitizeError(error, isDev)` helper function

### INT5: Constants Extraction (FR5)
- **File**: `src/main/update/controller.ts` (lines 235-236)
- **File**: `src/main/index.ts` (line 97)
- **Change**: Create shared constants file or define at top of controller.ts

### INT6: Dead Code Removal (FR6)
- **File**: `src/main/integration.ts` (line 9) - remove UpdateState
- **File**: `src/main/update/controller.ts` (line 10) - verify and remove UpdateState
- **File**: `src/main/update/controller.ts` (line 8) - verify app usage

---

## Implementation Order

Recommended sequence (can be parallelized where noted):

**Batch 1 - High Priority (parallel)**:
1. FR1: Download concurrency protection + TR4
2. FR2: File protocol support + TR5
3. TR1: E2E version transition test
4. TR2: Explicit dev mode pattern tests
5. TR3: Production safety regression test

**Batch 2 - Medium Priority (sequential)**:
6. FR3: URL validation before setFeedURL
7. FR4: Error message sanitization

**Batch 3 - Low Priority (parallel)**:
8. FR5: GitHub constants extraction
9. FR6: Dead code removal

---

## Success Criteria

1. All 307+ tests pass (existing + new)
2. No new regressions from baseline
3. Download concurrency race condition eliminated
4. File:// URLs work in dev mode per original FR2
5. Error messages don't expose internal details
6. All 8 dev mode patterns have explicit test coverage
7. E2E test validates constraint C2 (backward compatibility)
8. Production safety regression test prevents future bypasses
9. Code quality improved (constants extracted, dead code removed)

---

## Out of Scope

### Not Included in This Hardening Phase
- Changes to cryptographic verification logic
- Changes to manifest generation scripts
- Changes to update UI or state machine behavior
- New features beyond original specification
- Performance optimizations
- Refactoring beyond identified recommendations

### Explicitly Deferred
- Redirect chain validation for GitHub API responses
- Property-based test coverage increase (current 100 runs deemed sufficient)
- Investigation of pre-existing `getConfigPath` unused export

---

## Verification Questions for This Phase

1. Does `downloadUpdate()` properly reject concurrent calls?
2. Can file:// URLs be used in dev mode for manifest fetching?
3. Are all 8 dev mode activation patterns explicitly tested?
4. Does the E2E test validate successful old→new version update?
5. Are error messages sanitized in production mode?
6. Is URL validation performed at setup time (fail-fast)?
7. Are GitHub owner/repo constants in a single location?
8. Has all identified dead code been removed?

---

**Note**: This specification continues from the GitHub Provider Auto-Update feature.
Reference the parent specification at `specs/github-provider-auto-update-spec.md` for
original requirements and constraints.
