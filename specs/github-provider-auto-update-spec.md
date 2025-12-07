# GitHub Provider Auto-Update - Requirements Specification

## Problem Statement

Currently, the auto-updater constructs a version-specific feed URL that prevents cross-version updates. When v0.0.0 is running, it looks for updates at `https://github.com/941design/slim-chat/releases/download/v0.0.0/latest-mac.yml`, which means it can never discover v0.0.1 because each version only checks its own release folder.

This breaks the fundamental purpose of auto-updates: allowing older app versions to discover and install newer releases.

## Core Functionality

Enable cross-version auto-updates by switching from the generic provider with version-specific URLs to electron-updater's GitHub provider, which automatically discovers the latest release regardless of the current app version.

## Functional Requirements

### FR1: GitHub Provider for Production Updates
- **Requirement**: In production mode (no dev overrides), use electron-updater's GitHub provider
- **Acceptance Criteria**:
  - `autoUpdater.setFeedURL()` called with `provider: 'github'`, `owner: '941design'`, `repo: 'slim-chat'`
  - Feed URL no longer includes current app version
  - All app versions check the same GitHub release endpoint

### FR2: Dev Mode Override with Generic Provider
- **Requirement**: When `devUpdateSource` is set, continue using generic provider to support file:// URLs
- **Acceptance Criteria**:
  - If `devUpdateSource` env var or config is set, use `provider: 'generic'` with `url: devUpdateSource`
  - This enables local testing with file:// paths
  - Dev mode behavior remains unchanged from current implementation

### FR3: Remove manifestUrl Configuration
- **Requirement**: Remove support for `manifestUrl` config override
- **Acceptance Criteria**:
  - Remove `manifestUrl` field from `AppConfig` interface
  - Manifest URL always derived as `https://github.com/941design/slim-chat/releases/latest/download/manifest.json` in production
  - In dev mode with `devUpdateSource`, derive manifest URL by appending `/manifest.json` to the source
  - Update manifest fetching logic to use derived URLs

### FR4: Maintain Cryptographic Verification
- **Requirement**: Preserve all existing security verification (RSA signature + SHA-256 hash)
- **Acceptance Criteria**:
  - No changes to verification logic
  - Manifest still fetched and verified after download
  - Production safety constraints (C1) maintained

### FR5: Update Configuration UI
- **Requirement**: Remove manifestUrl from configuration UI and settings
- **Acceptance Criteria**:
  - Config loading/saving no longer handles manifestUrl
  - IPC handlers don't expose manifestUrl
  - Renderer UI doesn't show manifestUrl option

## Critical Constraints

### C1: Production Safety
- Dev mode features (forceDevUpdateConfig, devUpdateSource, allowPrerelease) must remain completely disabled in production builds
- Environment variable precedence over config file must be maintained
- No regression in security constraint enforcement

### C2: Backward Compatibility for Updates
- Apps running the old version (with version-specific URLs) will continue to work with their existing logic
- Once updated to the new version with GitHub provider, they'll be able to receive all future updates
- This is a one-time migration - no need to support both old and new clients simultaneously

### C3: Dev Mode Flexibility
- Developers must retain ability to test updates with local file:// URLs
- devUpdateSource override must continue working exactly as before

## Integration Points

### INT1: setupUpdater Function (src/main/update/controller.ts)
- Modify feed URL determination logic (lines 220-236)
- Switch from generic to GitHub provider for production
- Keep generic provider for dev mode overrides

### INT2: AppConfig Interface (src/shared/types.ts)
- Remove `manifestUrl?: string` field
- Update related types if needed

### INT3: Integration Layer (src/main/integration.ts)
- Update `constructManifestUrl()` to derive URL from GitHub repo (always use `/latest/download/`)
- Ensure manifest fetching works with new URL structure

### INT4: Configuration Module (src/main/config.ts)
- Remove manifestUrl from normalizeConfig()
- Remove from DEFAULT_CONFIG
- Ensure config migration handles old configs gracefully

### INT5: IPC Handlers (src/main/ipc/handlers.ts)
- Verify manifestUrl not exposed via config:get/config:set

## User Preferences

- **Simplicity over flexibility**: User prefers removing manifestUrl rather than maintaining it for edge cases
- **Standard GitHub workflow**: Rely on GitHub provider's built-in release discovery rather than custom URL schemes

## Codebase Context

### Current Implementation Pattern
The auto-updater uses a three-tier precedence for feed URL determination:
1. devUpdateSource (highest - dev mode only)
2. config.manifestUrl (fallback)
3. Default GitHub URL with version (lowest)

### Testing Patterns
- Heavy use of property-based testing with fast-check
- Mock-based testing for electron-updater
- Regression tests for auto-update bugs
- E2E tests with Playwright for update UI flows

### Similar Features
- Dev mode configuration follows precedence pattern: env vars > config > defaults
- Production safety is enforced via isDevModeActive flag
- All configuration changes are tested with both unit and integration tests

## Out of Scope

### Not Included in This Feature
- ❌ Changes to the cryptographic verification logic
- ❌ Changes to the manifest.json generation scripts
- ❌ Changes to update UI or state machine
- ❌ Migration logic for existing user configs (manifestUrl will simply be ignored if present)
- ❌ Support for custom update servers (use devUpdateSource in dev mode for testing)
- ❌ Changes to the GitHub release workflow or artifact uploads

### Explicitly Deferred
- Auto-update behavior settings (manual vs auto-download) remain unchanged
- Pre-release version handling remains unchanged
- Update verification flow remains unchanged

---

**Note**: This is a requirements specification, not an architecture design.
The specific implementation details (how to refactor tests, whether to add helper
functions, exact mock strategies) will be determined by the integration-architect
during the implementation phase.
