# Gap Remediation - Requirements Specification

## Problem Statement

The SlimChat bootstrap application has 12 identified gaps between the implementation and the Desktop App Bootstrap Specification. These gaps prevent production deployment, violate security requirements, and impact maintainability. The current implementation is 75-80% complete but requires systematic remediation across three severity tiers.

## Core Functionality

Implement all 12 gap fixes to achieve:
1. **Functional update pipeline** - Users can receive and install updates securely
2. **Spec compliance** - Implementation matches documented specification
3. **Production readiness** - Code quality, testing, and maintainability standards met

## Functional Requirements

### TIER 1 - Blocking Issues (4 gaps)

#### GAP-001: Hash Algorithm Standardization
**Current State:** Implementation uses SHA-512, spec requires SHA-256
**Required Behavior:**
- All hash computations must use SHA-256 algorithm
- Manifest generation script computes SHA-256 hashes
- Verification logic validates SHA-256 hashes
- TypeScript types use `sha256` field name (not `sha512`)
- No references to SHA-512 remain in codebase

**Acceptance Criteria:**
- `scripts/generate-manifest.ts` uses `crypto.createHash('sha256')`
- `src/main/index.ts` verification uses `crypto.createHash('sha256')`
- `ManifestFile` interface has `sha256: string` field
- Test manifest generated and verified successfully
- Grep confirms no `sha512` references

#### GAP-002: GitHub Release Creation
**Current State:** CI builds artifacts but doesn't create GitHub Releases
**Required Behavior:**
- CI workflow creates GitHub Release on version tag push
- Release includes all platform artifacts (macOS dmg/zip, Linux AppImage)
- Release includes signed `manifest.json`
- Release notes auto-generated or templated
- electron-updater can discover and download releases

**Acceptance Criteria:**
- `.github/workflows/release.yml` has `create-release` job
- Job depends on build-linux, build-macos, generate-manifest
- Uses `softprops/action-gh-release@v1` or equivalent
- Uploads all artifacts from download-artifact step
- Dry-run test with test tag succeeds
- Release appears at `https://github.com/{owner}/{repo}/releases/tag/v{version}`

#### GAP-003: GitHub Configuration Completion
**Current State:** `package.json` has empty `owner` and `repo` fields
**Required Behavior:**
- `build.publish[0].owner` filled with actual GitHub username/org
- `build.publish[0].repo` filled with actual repository name
- Configuration matches spec requirements
- electron-updater can check for updates against GitHub
- No hardcoded credentials in repository

**Acceptance Criteria:**
- `package.json` line 72-73 have non-empty owner/repo
- Values match actual GitHub repository
- `releaseType: "release"` specified
- `publishAutoUpdate: true` enabled
- electron-updater successfully queries GitHub API

#### GAP-004: Manifest Upload to Releases
**Current State:** Manifest generated but not uploaded to GitHub Release
**Required Behavior:**
- `manifest.json` uploaded to every GitHub Release
- Manifest publicly accessible at `https://github.com/{owner}/{repo}/releases/download/{version}/manifest.json`
- App constructs manifest URL from version + publish config
- Manifest download succeeds in verification flow
- No environment variables required for manifest URL in production

**Acceptance Criteria:**
- Manifest included in release assets (covered by GAP-002)
- `curl -L -f` can fetch manifest from release URL
- App dynamically constructs manifest URL from electron-builder config
- Verification flow successfully downloads and validates manifest

---

### TIER 2 - Should Fix Issues (5 gaps)

#### GAP-005: Manual Download Control
**Current State:** `autoUpdater.autoDownload = true` violates user consent requirement
**Required Behavior:**
- Auto-download disabled by default (`autoDownload = false`)
- Update-available state shows "Download Update" button
- Download starts only after user clicks button
- Button disabled during download with progress indication
- Optional config setting for power users to enable auto-download
- No bandwidth consumed without user consent

**Acceptance Criteria:**
- `src/main/index.ts` sets `autoDownload = false`
- IPC handler `download-update` added
- Preload API exposes `downloadUpdate()` method
- Renderer shows download button in `available` phase
- Config supports `autoUpdateBehavior: "manual" | "auto-download"`

#### GAP-006: Version Comparison in Verification
**Current State:** Manifest verification lacks version comparison logic
**Required Behavior:**
- Manifest versions validated using semver library
- Manifest version must be greater than current app version
- Equal versions rejected with warning log
- Lower versions rejected with warning log
- Invalid version strings rejected with error log
- Unit tests cover all version comparison scenarios

**Acceptance Criteria:**
- `semver` dependency installed
- `verifyManifest()` compares versions before signature check
- `semver.gt(manifest.version, currentVersion)` enforced
- Invalid versions rejected (`semver.valid()` check)
- Rejection logged with reason and versions
- Tests in `/tests/security/version.test.ts` pass

#### GAP-007: Nested IPC API Structure
**Current State:** Flat API structure, spec requires domain-nested organization
**Required Behavior:**
- API organized under domains: `updates`, `system`, `logs`, `config`, `app`
- IPC channels use domain prefix (e.g., `updates:check`)
- Type definitions match spec
- Renderer code updated to use nested API
- No breaking changes during migration (optional legacy support)

**Acceptance Criteria:**
- `window.api.updates.checkNow()` replaces `window.api.checkForUpdates()`
- `window.api.config.get()` replaces `window.api.getConfig()`
- All IPC handlers use domain:action pattern
- TypeScript types enforce correct nested structure
- Renderer components use new API structure

#### GAP-008: Complete Manifest JSON Structure
**Current State:** Manifest uses `files` array, spec requires `artifacts` with metadata
**Required Behavior:**
- Manifest uses `artifacts` array (not `files`)
- Each artifact has `platform` and `type` fields
- Manifest includes `createdAt` ISO 8601 timestamp
- Hash field named `sha256` (from GAP-001)
- Platform detection logic works for all artifact types
- Verification code updated for new structure

**Acceptance Criteria:**
- `ManifestArtifact` type has platform/type fields
- `SignedManifest` has `createdAt` field
- Manifest generation detects platform from filename
- Verification logic filters artifacts by current platform
- Generated manifest matches spec format exactly

#### GAP-009: Download Progress Display
**Current State:** Progress event captured but data not forwarded to UI
**Required Behavior:**
- Download progress includes percent, transferred bytes, total bytes
- Progress bar visually displayed in sidebar
- Progress text shows formatted bytes (KB/MB/GB)
- Download speed displayed (optional)
- Progress cleared on download complete
- UI handles missing total size gracefully

**Acceptance Criteria:**
- `UpdateState` interface has `progress?: DownloadProgress` field
- Progress handler updates state with all fields
- Renderer displays progress bar with percentage
- Bytes formatted with appropriate units
- Progress updates smoothly without jitter

---

### TIER 3 - Nice to Have Issues (3 gaps)

#### GAP-010: Modular Component Structure
**Current State:** Monolithic files, spec suggests modular organization
**Required Behavior:**
- Main process split into domain modules (update, security, ipc, config, logging)
- Renderer components extracted to separate files
- Layout components in `/src/renderer/layout/`
- Feature components in `/src/renderer/features/`
- Shared components in `/src/renderer/components/`
- No change in functionality

**Acceptance Criteria:**
- `/src/main/update/index.ts` handles updater logic
- `/src/main/security/verify.ts` handles verification
- `/src/main/ipc/handlers.ts` registers all IPC handlers
- Renderer has Header, Footer, Sidebar, StatusDashboard components
- Build and app startup work identically
- Directory structure matches spec §2.4

#### GAP-011: Log Rotation Implementation
**Current State:** Single log file with no size limit or rotation
**Required Behavior:**
- Log files rotate daily or when size limit reached
- Old logs automatically deleted after retention period
- Retention period configurable (default 14 days)
- Max file size configurable (default 10MB)
- App startup triggers cleanup of old logs
- Rotation events logged

**Acceptance Criteria:**
- `winston` with `winston-daily-rotate-file` installed (or equivalent)
- Daily rotation pattern: `app-%DATE%.log`
- `maxSize: '10m'` and `maxFiles: '14d'` configured
- Config interface has `logRetentionDays` and `logMaxFileSizeMB`
- Cleanup function runs on app startup

#### GAP-012: Test Suite Implementation
**Current State:** No test files or test runner configured
**Required Behavior:**
- Test runner configured (Vitest)
- Unit tests for manifest verification (Ed25519 signature validation)
- Unit tests for artifact hash verification (SHA-256)
- Unit tests for version comparison (semver)
- Tests run in CI pipeline
- Coverage report generated

**Acceptance Criteria:**
- `vitest.config.ts` configured
- `/tests/security/verify.test.ts` validates Ed25519 signatures
- `/tests/security/verify.test.ts` validates SHA-256 hashes
- `/tests/security/version.test.ts` validates semver comparisons
- `npm test` runs all tests successfully
- CI workflow includes test step
- Coverage report shows >80% for security modules

---

## Critical Constraints

### Security Requirements
- **Ed25519 signatures mandatory** - All manifest verification must validate Ed25519 signatures before accepting updates
- **Hash algorithm consistency** - SHA-256 must be used throughout (generation and verification)
- **No credential leakage** - Private keys must never be committed to repository
- **Version monotonicity** - System must reject downgrades and equal versions

### Compatibility Requirements
- **Breaking change acceptable** - SHA-512 to SHA-256 migration requires fresh v1.0.0 start
- **electron-updater compatibility** - Must work with electron-updater v6.3.9
- **Platform support** - macOS (12.0+) and Linux must both work
- **No user data loss** - Config and logs must survive updates

### Performance Requirements
- **Update check latency** - Check for updates within 5 seconds
- **Download efficiency** - No unnecessary re-downloads or bandwidth waste
- **UI responsiveness** - Progress updates at least every 500ms
- **Log file size** - Rotation prevents unbounded disk usage

## Integration Points

### Existing Code to Modify
- `scripts/generate-manifest.ts` - Hash algorithm, manifest structure
- `src/main/index.ts` - Verification logic, updater setup, IPC handlers
- `src/preload/index.ts` - API structure reorganization
- `src/renderer/main.tsx` - Download button, progress display, API calls
- `src/shared/types.ts` - Type definitions throughout
- `.github/workflows/release.yml` - Release creation job
- `package.json` - GitHub config, test scripts, dependencies

### New Files to Create
- `/tests/security/verify.test.ts` - Cryptographic verification tests
- `/tests/security/version.test.ts` - Semver comparison tests
- `/src/main/update/index.ts` - Updater module (TIER 3)
- `/src/main/security/verify.ts` - Verification module (TIER 3)
- `/src/main/ipc/handlers.ts` - IPC handlers module (TIER 3)
- `/src/renderer/layout/Header.tsx` - Header component (TIER 3)
- `/src/renderer/layout/Footer.tsx` - Footer component (TIER 3)
- `/src/renderer/layout/Sidebar.tsx` - Sidebar component (TIER 3)
- `/src/renderer/features/updates/UpdateIndicator.tsx` - Update UI (TIER 3)
- `/src/renderer/features/status/StatusDashboard.tsx` - Status dashboard (TIER 3)
- `vitest.config.ts` - Test configuration (TIER 3)

### External Dependencies
- Add: `semver` + `@types/semver` (GAP-006)
- Add: `winston` + `winston-daily-rotate-file` (GAP-011, optional)
- Add: `vitest` + `@vitest/ui` (GAP-012)
- No removals required

## User Preferences

### Implementation Approach
- **Systematic tier-by-tier** - Implement TIER 1 first, validate, then TIER 2, then TIER 3
- **Comprehensive testing** - Each tier should include relevant tests
- **Incremental commits** - Each GAP should be a separate logical commit
- **Documentation updates** - Update README/docs as features are added

### Migration Strategy
- **Version bump to v1.0.0** - After TIER 1 complete, tag as v1.0.0
- **No backward compatibility** - Clean break from any pre-1.0.0 versions
- **Manual first install** - Users must manually download v1.0.0, subsequent updates automatic

## Codebase Context

### Existing Patterns to Follow
- **TypeScript strict mode** - All code uses strict type checking
- **Async/await** - Promises handled with async/await, not callbacks
- **Structured logging** - Use `log()` function with level, message, context
- **IPC invoke pattern** - Use `ipcMain.handle` and `ipcRenderer.invoke`
- **React hooks** - Renderer uses functional components with hooks
- **Error boundaries** - Try/catch with proper error logging

### Similar Implementations
- **Config management** (`src/main/config.ts`) - Shows async file I/O pattern, defaults, validation
- **Logging** (`src/main/logging.ts`) - Shows structured logging, log levels, file management
- **Current verification** (`src/main/index.ts` lines 47-94) - Shows Ed25519 + hash verification pattern

### Architecture Principles
- **Separation of concerns** - Main/preload/renderer isolation
- **Type safety** - Shared types in `/src/shared/types.ts`
- **Security first** - Context isolation, no node integration in renderer
- **User control** - Manual actions preferred over automatic behavior

## Out of Scope

### Explicitly NOT Included
- **Windows support** - Not required (macOS and Linux only)
- **Key rotation mechanism** - Future enhancement
- **Automatic rollback** - Future enhancement
- **Telemetry/analytics** - Privacy-first design
- **In-app update preview** - Future enhancement
- **Beta/canary channels** - Single release channel only
- **Custom update servers** - GitHub Releases only
- **Offline update bundles** - Network required

### Future Enhancements
- Multi-key support for key rotation
- Incremental updates (delta patches)
- Update notifications system
- Configurable update channels
- Windows platform support

---

## Implementation Notes

### Phase Ordering
1. **TIER 1 (4-6 hours estimated)** - Makes update system functional
2. **TIER 2 (8-12 hours estimated)** - Achieves spec compliance
3. **TIER 3 (12-16 hours estimated)** - Production quality and maintainability

### Validation Strategy
- **After TIER 1**: End-to-end update flow test with real GitHub Release
- **After TIER 2**: Spec compliance audit against original specification
- **After TIER 3**: Full test suite run with coverage report

### Testing Checklist
- Unit tests for all security functions (GAP-012)
- Integration test: Full update flow (check → download → verify → install)
- Manual test: macOS DMG installation and update
- Manual test: Linux AppImage execution and update
- Error scenario tests: Invalid signature, hash mismatch, network failure

---

## Success Criteria

### TIER 1 Complete When:
- CI workflow creates GitHub Releases with all artifacts
- Manifest uses SHA-256 throughout
- GitHub owner/repo configured
- Real update check succeeds from test release

### TIER 2 Complete When:
- User must approve downloads (manual control)
- Version comparison prevents downgrades
- API follows nested domain structure
- Manifest matches spec format exactly
- Progress bar displays during downloads

### TIER 3 Complete When:
- Code organized in modular structure per spec
- Log rotation prevents unbounded growth
- Test suite achieves >80% coverage on security code
- All 12 gaps verified as resolved

### Production Ready When:
- All tiers complete
- Documentation updated
- GitHub repository configured (owner/repo/secrets)
- Ed25519 keypair generated and public key embedded
- v1.0.0 tag creates successful release
- Update flow works end-to-end from v1.0.0 to v1.0.1 test

---

**Generated from:** `/Users/mrother/Projects/941design/slim-chat/gap-analysis.md`
**Specification Date:** 2025-12-05
**Target Version:** v1.0.0
