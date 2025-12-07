# Dev Mode Update Testing - Requirements Specification

## Problem Statement

When running `npm run dev`, electron-updater skips update checks with the message "Skip checkForUpdates because application is not packed and dev update config is not forced". This prevents developers from:

1. Testing the update flow locally before releasing
2. Verifying updates against real GitHub releases or pre-releases
3. Testing the cryptographic verification and download process
4. Ensuring the UI properly handles various update states

**Why this feature exists**: Developers need confidence that the update system works correctly before shipping updates to users. The only way to achieve this is to test the complete update flow in a development environment.

## Core Functionality

Enable update checking in development mode (`npm run dev`) with the ability to test against:
- Real GitHub releases (stable and pre-releases)
- Local manifest files for controlled testing
- Configurable update sources for flexibility

The system must handle unavailable update sources gracefully and provide diagnostic information to help developers debug issues.

## Functional Requirements

### FR1: Enable Update Checks in Dev Mode
- **Requirement**: Override electron-updater's packaging check when running in development mode
- **Acceptance Criteria**:
  - When running `npm run dev`, update checks execute successfully (no "application is not packed" skip)
  - The override is development-only and does not affect production builds
  - Configuration is simple and doesn't require code changes for each test

### FR2: Configurable Update Sources
- **Requirement**: Allow developers to specify where to check for updates
- **Acceptance Criteria**:
  - Support checking against real GitHub releases at `https://github.com/941design/slim-chat/releases/download/v{version}/manifest.json`
  - Support checking against local manifest files (e.g., `file://./test-manifests/v1.0.0/manifest.json`)
  - Configuration mechanism allows quick switching between sources without code edits
  - Default behavior uses actual GitHub releases

### FR3: Pre-release Testing Support
- **Requirement**: Enable testing of pre-release versions in development/testing, block them in production
- **Acceptance Criteria**:
  - Development builds can detect and install pre-releases (e.g., 1.0.0-beta.1)
  - Production builds NEVER accept pre-releases (security/stability constraint)
  - CI workflow supports creating GitHub pre-releases based on version tags (e.g., tags matching `*-beta.*`, `*-alpha.*`)
  - Local manifest generation script can create pre-release manifests for testing

### FR4: Graceful Handling of Unavailable Sources
- **Requirement**: Handle missing/unavailable update sources without crashing or hanging
- **Acceptance Criteria**:
  - Network errors (404, timeout, DNS failure) transition to `failed` state with error detail
  - Invalid manifests (malformed JSON, missing fields) provide clear error messages
  - Version comparison failures (invalid semver) are reported as errors
  - Signature verification failures display detailed diagnostic info
  - UI shows "checking" → "idle" or "failed" transition, never gets stuck in "checking"

### FR5: Diagnostic Information in Dev Mode
- **Requirement**: Provide detailed diagnostic output to help debug update issues
- **Acceptance Criteria**:
  - Log update check process: manifest URL, version comparison, signature verification steps
  - Display detailed error messages in UI when updates fail (not just "error occurred")
  - Include HTTP response codes, network errors, and manifest parsing errors in logs
  - Show what versions are being compared (current vs available)

### FR6: Version Progression Testing
- **Requirement**: Use actual package.json version (0.0.0) for testing
- **Acceptance Criteria**:
  - Dev builds use real version from package.json without override/simulation
  - To test version upgrades, developers create GitHub releases with version > 0.0.0
  - No "fake version" configuration needed

## Critical Constraints

### C1: Production Safety
- Production builds MUST NOT accept pre-releases under any circumstances
- Dev-only features MUST be disabled in production builds
- Configuration for dev mode MUST NOT accidentally leak into production

### C2: Security Preservation
- All cryptographic verification (RSA signatures, SHA-256 hashes) remains required
- No bypassing of security checks even in dev mode
- Test manifests must be properly signed with the same key used in production

### C3: Backward Compatibility
- Existing production update flow must remain unchanged
- Current config.json structure compatible with new settings
- Existing IPC APIs remain functional

### C4: Developer Experience
- Switching between update sources should be simple (env var or config change)
- No code recompilation required to change update source
- Clear error messages guide developers when configuration is incorrect

## Integration Points

### IP1: electron-updater Configuration
- Modify `setupUpdater()` in src/main/update/controller.ts to force dev updates
- Configure `autoUpdater.forceDevUpdateConfig = true` when in dev mode
- Set `autoUpdater.setFeedURL()` based on configurable update source

### IP2: Environment Detection
- Use existing `VITE_DEV_SERVER_URL` env var as dev mode indicator
- Add new env vars for update source configuration (e.g., `DEV_UPDATE_SOURCE`, `ALLOW_PRERELEASE`)

### IP3: Config System
- Extend AppConfig type to include optional `devUpdateSource?: string` and `allowPrerelease?: boolean`
- Ensure config loading/saving in src/main/config.ts handles new fields
- Provide defaults that work for common testing scenarios

### IP4: CI/CD Workflow
- Enhance .github/workflows/release.yml to detect pre-release tags
- Generate pre-release GitHub releases for tags matching patterns like `*-alpha.*`, `*-beta.*`, `*-rc.*`
- Ensure manifest generation works for both stable and pre-release builds

### IP5: Logging System
- Extend logging in src/main/index.ts and src/main/update/controller.ts
- Add detailed diagnostic logs for dev mode update operations
- Include manifest fetch details, version comparisons, and verification steps

## User Preferences

### Architecture Approach
- **Minimal configuration**: Prefer environment variables over config file changes
- **Convention over configuration**: Sensible defaults that work without setup
- **Fail-safe**: If something is misconfigured, fail gracefully with clear error

### Implementation Philosophy
- **Separation of concerns**: Dev mode logic isolated from production code paths
- **Type safety**: Use TypeScript types to prevent configuration errors
- **Testability**: New logic should be unit-testable with property-based tests

## Codebase Context

### Current Update System Architecture
The update system has a clean separation:
- **controller.ts**: Manages electron-updater configuration and download triggers
- **index.ts**: Event handling, state machine, and verification orchestration
- **integration.ts**: Manifest fetching and cryptographic verification
- **types.ts**: Shared types (UpdateState, UpdatePhase, AppConfig)

### Similar Features to Reference
- **Config system** (src/main/config.ts): Shows how to extend AppConfig with optional fields
- **Environment detection** (src/main/index.ts lines 33-34): Uses `VITE_DEV_SERVER_URL` to detect dev mode
- **Manifest generation** (scripts/generate-manifest.ts): Shows how to create signed manifests for testing

### Key Patterns
- **Event-driven state machine**: Updates transition through distinct phases (idle → checking → available → downloading → verifying → ready)
- **Fail-safe defaults**: Config loading provides sensible defaults when values are missing
- **Cryptographic verification**: All manifests verified with RSA signatures before installation

## Out of Scope

### Explicitly NOT Included
- **Version override/simulation**: No pretending to be a different version (use real package.json version)
- **Automatic pre-release opt-in for users**: Production users never see pre-releases
- **Hot-reload during updates**: Still requires app restart to apply updates
- **Update rollback**: No reverting to previous versions after update
- **Differential updates**: Still downloads full packages, not deltas
- **Custom update UI for dev mode**: Reuses existing update UI with enhanced error display

---

**Note**: This is a requirements specification, not an architecture design.
The integration-architect will determine:
- Exact implementation of dev mode detection
- Configuration precedence (env vars vs config file vs defaults)
- Error handling strategies for various failure modes
- How to structure CI workflow pre-release detection
- Local manifest generation script implementation
