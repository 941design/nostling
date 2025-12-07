# Duplicate Release Assets Upload - Bug Report

## Bug Description
The GitHub release workflow fails with "Error: Not Found" when attempting to upload release assets. The error occurs because duplicate files (`builder-debug.yml` and `app-update.yml`) are being matched by the glob pattern `release-artifacts/**/*.yml`, causing the action to attempt uploading the same filename twice from different platform builds.

## Expected Behavior
The GitHub release should be created successfully with all necessary assets uploaded exactly once:
- `SlimChat-0.0.0.dmg` (macOS installer)
- `SlimChat-0.0.0-x86_64.AppImage` (Linux installer)
- `latest-mac.yml` (macOS update metadata)
- `latest-linux.yml` (Linux update metadata)
- `builder-debug.yml` (electron-builder debug info, once)
- `app-update.yml` (update provider config, once)
- `manifest.json` (RSA-signed custom manifest)

The release should be published (not remain as draft).

## Reproduction Steps
1. Create a new version tag: `git tag 0.0.2`
2. Push the tag: `git push origin 0.0.2`
3. Wait for GitHub Actions release workflow to complete
4. Observe workflow failure with "Error: Not Found" during asset upload
5. Check GitHub releases - release remains as draft or is not created

## Actual Behavior
The workflow logs show duplicate upload attempts:
```
⬆️ Uploading builder-debug.yml...
⬆️ Uploading app-update.yml...
...
⬆️ Uploading builder-debug.yml...    # DUPLICATE
⬆️ Uploading app-update.yml...       # DUPLICATE
```

Error message:
```
##[error]Not Found - https://docs.github.com/rest/releases/assets#update-a-release-asset
```

Most assets upload successfully, but the workflow fails and the release remains in draft state or incomplete.

## Impact
- Severity: **High**
- Affected Users: All users waiting for new releases
- Affected Workflows: Release automation, auto-update mechanism
- Business Impact: Cannot ship new versions to users; releases fail consistently

## Environment/Context
- GitHub Actions workflow: `.github/workflows/release.yml`
- Action version: `softprops/action-gh-release@v2`
- Build matrix: `ubuntu-latest` and `macos-13`
- Electron-builder version: Latest (from package.json)
- Affected releases: Every release since multi-platform support (0.0.1, 0.0.2)
- Working release: 0.0.0 (possibly single-platform only)

## Root Cause Hypothesis

**Primary Issue**: The glob pattern `release-artifacts/**/*.yml` matches files from both platform builds:

**macOS build creates:**
- `dist/builder-debug.yml`
- `dist/latest-mac.yml`
- `dist/mac-arm64/SlimChat.app/Contents/Resources/app-update.yml`

**Linux build creates:**
- `dist/builder-debug.yml` (same filename, different platform)
- `dist/latest-linux.yml`
- `dist/<linux-path>/app-update.yml` (same filename, different platform)

**Workflow behavior:**
1. Both builds upload artifacts to separate directories:
   - `release-artifacts/slimchat-ubuntu-latest/dist/**/*`
   - `release-artifacts/slimchat-macos-13/dist/**/*`

2. The glob `release-artifacts/**/*.yml` matches all `.yml` files recursively, including:
   - `release-artifacts/slimchat-ubuntu-latest/dist/builder-debug.yml`
   - `release-artifacts/slimchat-macos-13/dist/builder-debug.yml`
   - `release-artifacts/slimchat-ubuntu-latest/dist/app-update.yml`
   - `release-artifacts/slimchat-macos-13/dist/app-update.yml`

3. `softprops/action-gh-release@v2` attempts to upload both files with the same name
4. First upload succeeds, second upload attempts to "update" the existing asset
5. API returns "Not Found" error (likely permissions or API limitation)
6. Workflow fails, release remains incomplete/draft

**Why `latest-*.yml` files don't duplicate**: They have platform-specific names (`latest-mac.yml` vs `latest-linux.yml`).

**Why this affects release publishing**: The workflow failure prevents the release from being marked as published, even though `draft: false` is configured.

## Constraints
- Backward compatibility: Must maintain existing auto-update mechanism using `latest-mac.yml` and `latest-linux.yml`
- Performance: Should not significantly increase workflow time
- API contracts: Must continue uploading all files required by electron-updater
- Security: Maintain RSA-signed manifest.json for update verification

## Codebase Context

**Likely location**: `.github/workflows/release.yml` (lines 58-68)

**Related code**:
- Electron-builder config: `package.json` "build" section
- Manifest generation: `scripts/generate-manifest.ts`
- Update controller: `src/main/update/controller.ts:160-167`

**Recent changes**:
- Commit 7b25629: Added `release-artifacts/**/*.yml` pattern (introduced the duplication issue)
- Commit 54ea9f2: Moved to RSA signing
- Commit 5696df1: Added manifest generation step

**Similar bugs**: None documented in test files related to workflow asset uploads

**Platform-specific files**:
- `builder-debug.yml`: Internal electron-builder debug info (identical across platforms, not needed for users)
- `app-update.yml`: Embedded in app bundles (at `.../Contents/Resources/app-update.yml`), not needed as standalone release asset
- `latest-*.yml`: Platform-specific metadata (correctly differentiated by name)
- `manifest.json`: Generated on Linux only (no duplication)

## Out of Scope
- Refactoring the entire release workflow
- Changing electron-builder configuration unless necessary
- Optimizing build times or artifact sizes
- Adding new release features
