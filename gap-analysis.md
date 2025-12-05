# Gap Analysis & Remediation Specification

**Document Version:** 1.0
**Date:** 2025-12-05
**Status:** Draft
**Related:** [spec.md](./spec.md)

---

## 1. Executive Summary

This document identifies gaps between the [Desktop App Bootstrap Specification](./spec.md) and the current implementation, categorizes them by severity, and provides detailed remediation specifications for each gap.

**Overall Implementation Status:** 75-80% complete

**Critical Blockers:** 4 issues preventing production deployment
**Important Issues:** 5 issues affecting spec compliance
**Minor Issues:** 3 issues for future improvement

---

## 2. Gap Classification

### 2.1 Severity Levels

- **🔴 TIER 1 - BLOCKING**: Must fix before any production release. Prevents core functionality or violates critical security requirements.
- **🟡 TIER 2 - SHOULD FIX**: Should fix before initial release. Violates spec requirements or introduces security/UX issues.
- **🟢 TIER 3 - NICE TO HAVE**: Address in subsequent releases. Improves code quality, maintainability, or user experience.

---

## 3. TIER 1 - Blocking Issues

### GAP-001: Hash Algorithm Mismatch (SHA-512 vs SHA-256)

**Severity:** 🔴 BLOCKING
**Spec Reference:** §4.1, §4.2
**Impact:** Manifest verification incompatible with spec; potential interoperability issues with future tooling.

#### Current State

- **CI Script** (`/scripts/generate-manifest.ts:18`):
  ```typescript
  const hash = crypto.createHash('sha512').update(content).digest('hex');
  ```
  Stores as `sha512` field in manifest.

- **App Verification** (`/src/main/index.ts:74,86-94`):
  ```typescript
  const computedHash = crypto.createHash('sha512').update(fileContent).digest('hex');
  if (computedHash !== manifestEntry.sha512) { /* fail */ }
  ```

- **Spec Requirement** (§4.1):
  ```json
  {
    "artifacts": [
      { "sha256": "<hex-encoded-sha256>" }
    ]
  }
  ```

#### Remediation

**Change all hash operations to SHA-256:**

1. **Update Manifest Generation Script** (`/scripts/generate-manifest.ts`)
   ```typescript
   // Line 18: Change from sha512 to sha256
   const hash = crypto.createHash('sha256').update(content).digest('hex');

   // Line 22-28: Update manifest structure
   files.push({
     filename: file,
     url: `https://github.com/${owner}/${repo}/releases/download/${tag}/${file}`,
     sha256: hash,  // Change from sha512
     size: stats.size
   });
   ```

2. **Update TypeScript Types** (`/src/shared/types.ts`)
   ```typescript
   export interface ManifestFile {
     filename: string;
     url: string;
     sha256: string;  // Change from sha512
     size: number;
   }
   ```

3. **Update Verification Logic** (`/src/main/index.ts`)
   ```typescript
   // Line 74: Change hash algorithm
   const computedHash = crypto
     .createHash('sha256')  // Change from sha512
     .update(fileContent)
     .digest('hex');

   // Line 91: Update field access
   if (computedHash !== manifestEntry.sha256) {  // Change from sha512
     throw new Error(`Hash mismatch for ${manifestEntry.filename}`);
   }
   ```

4. **Migration Note**
   - This change is **breaking** for any existing manifests
   - Requires re-generating all manifests in existing releases
   - Version 1.0.0 should use SHA-256 from the start

#### Acceptance Criteria

- [ ] All hash computations use SHA-256
- [ ] Manifest JSON field is `sha256` (not `sha512`)
- [ ] TypeScript types updated
- [ ] No references to SHA-512 remain in codebase
- [ ] Test manifest generated and verified successfully

---

### GAP-002: Missing GitHub Release Creation in CI

**Severity:** 🔴 BLOCKING
**Spec Reference:** §7.3
**Impact:** Updates cannot be published; electron-updater cannot discover new versions.

#### Current State

- **Workflow** (`.github/workflows/release.yml`):
  - Builds artifacts on Ubuntu and macOS runners
  - Uploads artifacts to GitHub Actions storage only
  - Manifest generated but not published
  - **No GitHub Release created**

- **Spec Requirement** (§7.3):
  > "Creates or updates GitHub Release corresponding to the tag"
  > "Uploads artifacts and `manifest.json` to the Release"

#### Remediation

**Add release creation and asset upload steps:**

1. **Update Workflow Structure**

   Current flow:
   ```
   build-linux (parallel) → artifacts stored
   build-macos (parallel) → artifacts stored
   generate-manifest → manifest stored
   [END - nothing published]
   ```

   Required flow:
   ```
   build-linux (parallel) → artifacts stored
   build-macos (parallel) → artifacts stored
   [wait for both]
   generate-manifest → manifest stored
   create-release → publishes all assets to GitHub Release
   ```

2. **Add Release Job** (`.github/workflows/release.yml`)

   ```yaml
   create-release:
     name: Create GitHub Release
     needs: [build-linux, build-macos, generate-manifest]
     runs-on: ubuntu-latest
     permissions:
       contents: write

     steps:
       - name: Checkout code
         uses: actions/checkout@v4

       - name: Download all artifacts
         uses: actions/download-artifact@v4
         with:
           path: release-assets

       - name: Flatten artifact directories
         run: |
           mkdir -p final-release
           find release-assets -type f -exec mv {} final-release/ \;

       - name: Extract version from tag
         id: version
         run: |
           TAG_NAME="${GITHUB_REF#refs/tags/}"
           VERSION="${TAG_NAME#v}"
           echo "tag=${TAG_NAME}" >> $GITHUB_OUTPUT
           echo "version=${VERSION}" >> $GITHUB_OUTPUT

       - name: Create GitHub Release
         uses: softprops/action-gh-release@v1
         with:
           name: "Release ${{ steps.version.outputs.tag }}"
           tag_name: ${{ steps.version.outputs.tag }}
           draft: false
           prerelease: false
           generate_release_notes: true
           files: |
             final-release/*.dmg
             final-release/*.zip
             final-release/*.AppImage
             final-release/manifest.json
           body: |
             ## SlimChat Bootstrap ${{ steps.version.outputs.version }}

             ### Installation

             **macOS:**
             1. Download `SlimChat-${{ steps.version.outputs.version }}-mac.dmg`
             2. Open the DMG and drag app to Applications
             3. Right-click app → Open (to bypass Gatekeeper on first launch)

             **Linux:**
             1. Download `SlimChat-${{ steps.version.outputs.version }}.AppImage`
             2. Make executable: `chmod +x SlimChat-*.AppImage`
             3. Run: `./SlimChat-*.AppImage`

             ### Verification

             This release includes a cryptographically signed `manifest.json` with SHA-256 hashes.
             The app verifies updates using Ed25519 signatures before installation.

             ### Changes

             See release notes below.
         env:
           GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

       - name: Verify release assets
         run: |
           echo "Checking published release assets..."
           gh release view "${{ steps.version.outputs.tag }}" --json assets --jq '.assets[].name'
         env:
           GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
   ```

3. **Update electron-builder Configuration**

   The workflow must ensure electron-updater can find releases. Verify `package.json`:

   ```json
   {
     "build": {
       "publish": [
         {
           "provider": "github",
           "owner": "YOUR_GITHUB_USERNAME",
           "repo": "slim-chat",
           "releaseType": "release"
         }
       ]
     }
   }
   ```

4. **Add Workflow Permissions**

   Ensure workflow has permission to create releases:

   ```yaml
   name: Release

   on:
     push:
       tags:
         - 'v*'

   permissions:
     contents: write  # Required for creating releases
   ```

#### Testing Strategy

1. **Dry-run Test**:
   - Create a test tag: `v0.0.1-test`
   - Verify workflow creates release
   - Verify all assets uploaded
   - Delete test release and tag

2. **First Production Release**:
   - Tag: `v1.0.0`
   - Verify release appears at `https://github.com/owner/slim-chat/releases/tag/v1.0.0`
   - Verify assets downloadable
   - Verify manifest.json accessible

#### Acceptance Criteria

- [ ] Workflow creates GitHub Release on tag push
- [ ] All platform artifacts uploaded (macOS .dmg/.zip, Linux .AppImage)
- [ ] `manifest.json` uploaded to release
- [ ] Release notes auto-generated or templated
- [ ] electron-updater can discover and download releases
- [ ] Workflow succeeds end-to-end for test tag

---

### GAP-003: Empty GitHub Configuration in package.json

**Severity:** 🔴 BLOCKING
**Spec Reference:** §7.1, §7.2
**Impact:** electron-updater cannot locate GitHub releases; update checks will fail.

#### Current State

**File:** `package.json` lines 72-73

```json
{
  "build": {
    "publish": [
      {
        "provider": "github",
        "owner": "",
        "repo": ""
      }
    ]
  }
}
```

#### Remediation

**Fill in actual repository details:**

```json
{
  "build": {
    "appId": "com.example.slimchat",
    "productName": "SlimChat",
    "publish": [
      {
        "provider": "github",
        "owner": "YOUR_GITHUB_USERNAME",
        "repo": "slim-chat",
        "releaseType": "release",
        "publishAutoUpdate": true
      }
    ],
    "mac": {
      "category": "public.app-category.productivity",
      "target": [
        {
          "target": "dmg",
          "arch": ["x64", "arm64"]
        },
        {
          "target": "zip",
          "arch": ["x64", "arm64"]
        }
      ]
    },
    "linux": {
      "target": [
        {
          "target": "AppImage",
          "arch": ["x64"]
        }
      ],
      "category": "Utility"
    }
  }
}
```

#### Configuration Details

**Required Fields:**

- **owner**: GitHub username or organization (e.g., `941design`)
- **repo**: Repository name (e.g., `slim-chat`)
- **releaseType**: `"release"` (exclude pre-releases) or `"prerelease"` (include)
- **publishAutoUpdate**: `true` (enables electron-updater to read release metadata)

**Optional Fields:**

- **host**: Default `github.com` (for GitHub Enterprise, specify custom domain)
- **protocol**: Default `https`
- **token**: Not needed (public releases use anonymous access)

#### Environment-Specific Configuration

For different deployment targets (dev/staging/prod), use environment variables:

```typescript
// In main process before autoUpdater setup
if (process.env.UPDATE_REPO_OVERRIDE) {
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: process.env.UPDATE_OWNER || 'default-owner',
    repo: process.env.UPDATE_REPO || 'default-repo',
  });
}
```

#### Acceptance Criteria

- [ ] `owner` field filled with actual GitHub username/org
- [ ] `repo` field filled with actual repository name
- [ ] Configuration matches spec requirements (§7.1)
- [ ] electron-updater successfully checks for updates against GitHub
- [ ] No hardcoded credentials in repository

---

### GAP-004: Missing Manifest Upload to GitHub Release

**Severity:** 🔴 BLOCKING
**Spec Reference:** §4.1, §4.2
**Impact:** App cannot download and verify manifest; all updates will fail verification.

#### Current State

- Manifest generated in `generate-manifest` job
- Uploaded to GitHub Actions artifacts only
- **Not uploaded to GitHub Release**
- Verification code expects manifest at GitHub Release URL

#### Remediation

**Already addressed in GAP-002** (GitHub Release creation includes manifest upload).

Additional considerations:

1. **Manifest URL Construction**

   App must know where to fetch manifest. Current implementation uses:

   ```typescript
   const manifestUrl = process.env.MANIFEST_URL ||
                       config.manifestUrl ||
                       'https://example.com/manifest.json';
   ```

   **Spec-compliant approach:**

   ```typescript
   function getManifestUrl(version: string): string {
     const { owner, repo } = getPublishConfig(); // From package.json
     return `https://github.com/${owner}/${repo}/releases/download/${version}/manifest.json`;
   }

   // In update flow after update-available event:
   autoUpdater.on('update-available', async (info) => {
     const manifestUrl = getManifestUrl(`v${info.version}`);
     const manifest = await downloadManifest(manifestUrl);
     await verifyManifest(manifest);
     // ... proceed with download
   });
   ```

2. **Manifest Accessibility**

   Verify manifest is publicly accessible:

   ```bash
   # Test after release creation
   curl -L -f "https://github.com/owner/repo/releases/download/v1.0.0/manifest.json"
   ```

   If 404, check:
   - Release is not a draft
   - Asset was uploaded successfully
   - Repository is public or token has access

3. **Manifest Caching**

   Add HTTP caching headers consideration:

   ```typescript
   async function downloadManifest(url: string): Promise<SignedManifest> {
     const response = await fetch(url, {
       headers: {
         'Cache-Control': 'no-cache', // Always fetch fresh manifest
       },
     });

     if (!response.ok) {
       throw new Error(`Failed to download manifest: ${response.status}`);
     }

     return response.json();
   }
   ```

#### Acceptance Criteria

- [ ] `manifest.json` uploaded to every GitHub Release
- [ ] Manifest publicly accessible at predictable URL
- [ ] App constructs manifest URL from version + publish config
- [ ] Manifest download succeeds in verification flow
- [ ] No environment variables required for manifest URL in production

---

## 4. TIER 2 - Should Fix Issues

### GAP-005: Auto-download Always Enabled

**Severity:** 🟡 SHOULD FIX
**Spec Reference:** §3.2
**Impact:** Violates user consent requirement; wastes bandwidth; poor UX on metered connections.

#### Current State

**File:** `/src/main/index.ts:53`

```typescript
autoUpdater.autoDownload = true;
```

**Behavior:**
- Update check runs on startup
- If update available, download starts immediately
- User has no opportunity to defer or cancel
- Violates spec: "Use `autoUpdater.downloadUpdate()` only after user chooses to download"

#### Remediation

**Implement manual download control:**

1. **Disable Auto-download** (`/src/main/index.ts`)

   ```typescript
   autoUpdater.autoDownload = false;  // Change from true
   autoUpdater.autoInstallOnAppQuit = false;
   ```

2. **Add User-initiated Download IPC Handler**

   ```typescript
   // In /src/main/index.ts
   ipcMain.handle('download-update', async () => {
     try {
       log('info', 'User initiated update download');
       await autoUpdater.downloadUpdate();
       return { success: true };
     } catch (error) {
       log('error', 'Failed to download update', { error });
       return { success: false, error: String(error) };
     }
   });
   ```

3. **Update Preload API** (`/src/preload/index.ts`)

   ```typescript
   export interface RendererApi {
     // ... existing methods
     downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
   }

   contextBridge.exposeInMainWorld('api', {
     // ... existing methods
     downloadUpdate: () => ipcRenderer.invoke('download-update'),
   });
   ```

4. **Update Renderer UI** (`/src/renderer/main.tsx`)

   Current button logic:
   ```typescript
   {phase === 'available' && (
     <button onClick={handleCheckForUpdates}>Check for updates</button>
   )}
   ```

   New button logic:
   ```typescript
   {phase === 'available' && (
     <button onClick={handleDownloadUpdate} disabled={isDownloading}>
       Download Update
     </button>
   )}

   // Add handler:
   const handleDownloadUpdate = async () => {
     setIsDownloading(true);
     const result = await window.api.downloadUpdate();
     if (!result.success) {
       // Show error notification
       console.error('Download failed:', result.error);
     }
   };
   ```

5. **Update State Machine**

   Current: `idle → checking → available → downloading → ...`

   New: `idle → checking → available → [user action] → downloading → ...`

   Add explicit state to track user intent:
   ```typescript
   interface UpdateState {
     phase: UpdatePhase;
     userApprovedDownload: boolean;  // New field
     // ... other fields
   }
   ```

#### User Flow

```
1. App starts → Auto-check begins
2. Update available → Sidebar shows "Update available v1.2.3" + "Download" button
3. User clicks "Download" → Download begins, button disabled, progress shown
4. Download completes → Verification runs
5. Verification succeeds → "Restart to update" button appears
```

#### Configuration Support

Add config option for power users:

```json
{
  "autoUpdateBehavior": "manual" | "auto-download" | "auto-install"
}
```

Implementation:
```typescript
if (config.autoUpdateBehavior === 'auto-download') {
  autoUpdater.autoDownload = true;
} else {
  autoUpdater.autoDownload = false;
}
```

Default: `"manual"`

#### Acceptance Criteria

- [ ] `autoUpdater.autoDownload = false` by default
- [ ] Update available state shows download button
- [ ] Download only starts after user clicks button
- [ ] Button disabled during download
- [ ] Config option to enable auto-download for power users
- [ ] No bandwidth consumed without user consent

---

### GAP-006: Missing Version Comparison in Manifest Verification

**Severity:** 🟡 SHOULD FIX
**Spec Reference:** §4.1
**Impact:** Potential downgrade attacks; unclear behavior on version equality.

#### Current State

**File:** `/src/main/index.ts:47-70` (verifyManifest function)

```typescript
async function verifyManifest(manifest: SignedManifest): Promise<boolean> {
  try {
    // 1. Extract signature
    const signature = Buffer.from(manifest.signature, 'base64');

    // 2. Create manifest copy without signature
    const manifestCopy = { ...manifest };
    delete manifestCopy.signature;

    // 3. Verify signature
    const publicKey = Buffer.from(PUBLIC_KEY, 'base64');
    const message = Buffer.from(JSON.stringify(manifestCopy));
    const valid = nacl.sign.detached.verify(message, signature, publicKey);

    // MISSING: Version comparison

    return valid;
  } catch (error) {
    log('error', 'Manifest verification failed', { error });
    return false;
  }
}
```

**Spec Requirement** (§4.1):
> "Ensures manifest version is greater than app's current version before accepting"

#### Remediation

**Add version comparison logic:**

1. **Install semver Dependency**

   ```bash
   npm install semver
   npm install --save-dev @types/semver
   ```

2. **Update Verification Function** (`/src/main/index.ts`)

   ```typescript
   import semver from 'semver';
   import { app } from 'electron';

   async function verifyManifest(manifest: SignedManifest): Promise<boolean> {
     try {
       const currentVersion = app.getVersion();

       // 1. Version comparison (NEW)
       if (!semver.valid(manifest.version)) {
         log('error', 'Invalid version in manifest', { version: manifest.version });
         return false;
       }

       if (!semver.gt(manifest.version, currentVersion)) {
         log('warn', 'Manifest version not greater than current version', {
           manifestVersion: manifest.version,
           currentVersion,
         });
         return false;
       }

       // 2. Extract signature
       const signature = Buffer.from(manifest.signature, 'base64');

       // 3. Create manifest copy without signature for verification
       const manifestCopy = { ...manifest };
       delete manifestCopy.signature;

       // 4. Serialize deterministically
       const message = Buffer.from(JSON.stringify(manifestCopy, null, 2));

       // 5. Verify Ed25519 signature
       const publicKey = Buffer.from(PUBLIC_KEY, 'base64');
       const valid = nacl.sign.detached.verify(message, signature, publicKey);

       if (!valid) {
         log('error', 'Manifest signature verification failed');
         return false;
       }

       log('info', 'Manifest verification successful', {
         manifestVersion: manifest.version,
         currentVersion,
       });

       return true;
     } catch (error) {
       log('error', 'Manifest verification failed', { error });
       return false;
     }
   }
   ```

3. **Add Version Comparison Tests**

   Create `/tests/manifest-verification.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach } from 'vitest';
   import semver from 'semver';

   describe('Manifest Version Validation', () => {
     it('should reject manifest with invalid version', () => {
       const version = 'invalid';
       expect(semver.valid(version)).toBe(null);
     });

     it('should reject manifest with equal version', () => {
       const current = '1.0.0';
       const manifest = '1.0.0';
       expect(semver.gt(manifest, current)).toBe(false);
     });

     it('should reject manifest with lower version', () => {
       const current = '1.2.0';
       const manifest = '1.1.0';
       expect(semver.gt(manifest, current)).toBe(false);
     });

     it('should accept manifest with higher patch version', () => {
       const current = '1.0.0';
       const manifest = '1.0.1';
       expect(semver.gt(manifest, current)).toBe(true);
     });

     it('should accept manifest with higher minor version', () => {
       const current = '1.0.0';
       const manifest = '1.1.0';
       expect(semver.gt(manifest, current)).toBe(true);
     });

     it('should accept manifest with higher major version', () => {
       const current = '1.0.0';
       const manifest = '2.0.0';
       expect(semver.gt(manifest, current)).toBe(true);
     });
   });
   ```

4. **Log Version Decisions**

   Enhance logging for debugging:

   ```typescript
   log('info', 'Version comparison', {
     current: currentVersion,
     manifest: manifest.version,
     result: semver.gt(manifest.version, currentVersion) ? 'accept' : 'reject',
   });
   ```

#### Edge Cases

1. **Prerelease Versions**

   ```typescript
   // If supporting prereleases (future):
   const allowPrerelease = config.allowPrerelease;

   if (!allowPrerelease && semver.prerelease(manifest.version)) {
     log('info', 'Skipping prerelease version', { version: manifest.version });
     return false;
   }
   ```

2. **Version Metadata**

   ```typescript
   // semver ignores build metadata (+xxx) in comparisons
   // '1.0.0+20130313144700' === '1.0.0' for comparison purposes
   ```

#### Acceptance Criteria

- [ ] Manifest versions validated using semver
- [ ] Manifest version must be greater than current app version
- [ ] Equal versions rejected
- [ ] Lower versions rejected
- [ ] Invalid version strings rejected
- [ ] Rejection logged with reason and versions
- [ ] Unit tests cover all version comparison scenarios

---

### GAP-007: IPC API Structure Deviation from Spec

**Severity:** 🟡 SHOULD FIX
**Spec Reference:** §6.2
**Impact:** API surface doesn't match spec; harder to extend; inconsistent patterns.

#### Current State

**Current API** (`/src/preload/index.ts`):

```typescript
interface RendererApi {
  getStatus: () => Promise<AppStatus>;
  checkForUpdates: () => Promise<void>;
  restartToUpdate: () => Promise<void>;
  onUpdateState: (callback: (state: UpdateState) => void) => () => void;
  getConfig: () => Promise<AppConfig>;
  setConfig: (config: Partial<AppConfig>) => Promise<void>;
}

// Usage: window.api.getStatus()
```

**Spec-Required API** (§6.2):

```typescript
interface UpdatesAPI {
  checkNow(): Promise<void>;
  getStatus(): Promise<UpdateStatus>;
  onStatusChanged(callback: (status: UpdateStatus) => void): () => void;
  restartToApplyUpdate(): Promise<void>;
}

interface SystemAPI {
  getInfo(): Promise<SystemInfo>;
}

interface LogsAPI {
  getRecent(limit?: number): Promise<LogEntry[]>;
}

interface ConfigAPI {
  get(): Promise<Config>;
  update(patch: Partial<Config>): Promise<Config>;
}

interface AppAPI {
  getVersion(): Promise<string>;
}

declare global {
  interface Window {
    api: {
      updates: UpdatesAPI;
      system: SystemAPI;
      logs: LogsAPI;
      config: ConfigAPI;
      app: AppAPI;
    };
  }
}

// Usage: window.api.updates.checkNow()
```

#### Remediation

**Refactor to domain-nested structure:**

1. **Update Type Definitions** (`/src/shared/types.ts`)

   ```typescript
   // Domain: Updates
   export interface UpdatesAPI {
     checkNow(): Promise<void>;
     getStatus(): Promise<UpdateStatus>;
     onStatusChanged(callback: (status: UpdateStatus) => void): () => void;
     restartToApplyUpdate(): Promise<void>;
     downloadUpdate(): Promise<{ success: boolean; error?: string }>;
   }

   export interface UpdateStatus {
     state: UpdatePhase;
     availableVersion?: string;
     progress?: {
       percent: number;
       transferred: number;
       total?: number;
     };
     lastCheckAt?: string;
     errorMessage?: string;
   }

   // Domain: System
   export interface SystemAPI {
     getInfo(): Promise<SystemInfo>;
   }

   export interface SystemInfo {
     platform: 'macos' | 'linux';
     osVersion: string;
     arch: string;
   }

   // Domain: Logs
   export interface LogsAPI {
     getRecent(limit?: number): Promise<LogEntry[]>;
   }

   export interface LogEntry {
     timestamp: string;
     level: 'debug' | 'info' | 'warn' | 'error';
     message: string;
     context?: Record<string, unknown>;
   }

   // Domain: Config
   export interface ConfigAPI {
     get(): Promise<Config>;
     update(patch: Partial<Config>): Promise<Config>;
   }

   export interface Config {
     autoUpdate: boolean;
     allowPrerelease: boolean;
     updateCheckIntervalHours: number;
     logLevel: 'debug' | 'info' | 'warn' | 'error';
   }

   // Domain: App
   export interface AppAPI {
     getVersion(): Promise<string>;
   }

   // Combined API
   export interface RendererApi {
     updates: UpdatesAPI;
     system: SystemAPI;
     logs: LogsAPI;
     config: ConfigAPI;
     app: AppAPI;
   }

   declare global {
     interface Window {
       api: RendererApi;
     }
   }
   ```

2. **Update Preload Script** (`/src/preload/index.ts`)

   ```typescript
   import { contextBridge, ipcRenderer } from 'electron';
   import type { RendererApi } from '../shared/types';

   const api: RendererApi = {
     // Updates domain
     updates: {
       checkNow: () => ipcRenderer.invoke('updates:check'),

       getStatus: () => ipcRenderer.invoke('updates:get-status'),

       onStatusChanged: (callback) => {
         const listener = (_event: Electron.IpcRendererEvent, state: UpdateStatus) => {
           callback(state);
         };
         ipcRenderer.on('update-state', listener);

         // Return unsubscribe function
         return () => {
           ipcRenderer.removeListener('update-state', listener);
         };
       },

       restartToApplyUpdate: () => ipcRenderer.invoke('updates:restart'),

       downloadUpdate: () => ipcRenderer.invoke('updates:download'),
     },

     // System domain
     system: {
       getInfo: () => ipcRenderer.invoke('system:get-info'),
     },

     // Logs domain
     logs: {
       getRecent: (limit = 200) => ipcRenderer.invoke('logs:get-recent', limit),
     },

     // Config domain
     config: {
       get: () => ipcRenderer.invoke('config:get'),
       update: (patch) => ipcRenderer.invoke('config:update', patch),
     },

     // App domain
     app: {
       getVersion: () => ipcRenderer.invoke('app:get-version'),
     },
   };

   contextBridge.exposeInMainWorld('api', api);
   ```

3. **Update IPC Handlers** (`/src/main/index.ts`)

   Create dedicated handler registration:

   ```typescript
   function registerIPCHandlers() {
     // Updates domain
     ipcMain.handle('updates:check', async () => {
       await autoUpdater.checkForUpdates();
     });

     ipcMain.handle('updates:get-status', async () => {
       return {
         state: currentUpdateState.phase,
         availableVersion: currentUpdateState.availableVersion,
         progress: currentUpdateState.progress,
         lastCheckAt: currentUpdateState.lastUpdateCheck,
         errorMessage: currentUpdateState.errorMessage,
       };
     });

     ipcMain.handle('updates:restart', async () => {
       autoUpdater.quitAndInstall();
     });

     ipcMain.handle('updates:download', async () => {
       try {
         await autoUpdater.downloadUpdate();
         return { success: true };
       } catch (error) {
         return { success: false, error: String(error) };
       }
     });

     // System domain
     ipcMain.handle('system:get-info', async () => {
       return {
         platform: process.platform === 'darwin' ? 'macos' : 'linux',
         osVersion: require('os').release(),
         arch: process.arch,
       };
     });

     // Logs domain
     ipcMain.handle('logs:get-recent', async (_event, limit = 200) => {
       return getRecentLogs(limit);
     });

     // Config domain
     ipcMain.handle('config:get', async () => {
       return loadConfig();
     });

     ipcMain.handle('config:update', async (_event, patch) => {
       return updateConfig(patch);
     });

     // App domain
     ipcMain.handle('app:get-version', async () => {
       return app.getVersion();
     });
   }
   ```

4. **Update Renderer Usage** (`/src/renderer/main.tsx`)

   ```typescript
   // Old usage:
   const status = await window.api.getStatus();
   await window.api.checkForUpdates();
   const config = await window.api.getConfig();

   // New usage:
   const updateStatus = await window.api.updates.getStatus();
   await window.api.updates.checkNow();
   const config = await window.api.config.get();
   const systemInfo = await window.api.system.getInfo();
   const logs = await window.api.logs.getRecent(100);
   const version = await window.api.app.getVersion();
   ```

5. **Migration Strategy**

   For gradual migration, provide both APIs temporarily:

   ```typescript
   // In preload
   contextBridge.exposeInMainWorld('api', {
     // New nested API
     updates: { /* ... */ },
     system: { /* ... */ },

     // Legacy flat API (deprecated)
     getStatus: () => ipcRenderer.invoke('updates:get-status'),
     checkForUpdates: () => ipcRenderer.invoke('updates:check'),
     // ...
   });
   ```

   Add deprecation warnings:
   ```typescript
   getStatus: () => {
     console.warn('window.api.getStatus() is deprecated, use window.api.updates.getStatus()');
     return ipcRenderer.invoke('updates:get-status');
   },
   ```

#### Benefits

1. **Logical Grouping**: Related functions organized by domain
2. **Discoverability**: IDE autocomplete shows domain structure
3. **Extensibility**: Easy to add new methods to existing domains
4. **Spec Compliance**: Matches documented API surface
5. **Type Safety**: TypeScript enforces correct usage

#### Acceptance Criteria

- [ ] API nested under domains (updates, system, logs, config, app)
- [ ] All IPC channels use domain prefix (e.g., `updates:check`)
- [ ] Type definitions match spec §6.2
- [ ] Renderer code updated to use nested API
- [ ] No breaking changes during migration period
- [ ] Documentation updated with new API structure

---

### GAP-008: Incomplete Manifest JSON Structure

**Severity:** 🟡 SHOULD FIX
**Spec Reference:** §4.1
**Impact:** Manifest doesn't match spec format; missing metadata fields.

#### Current State

**Current Manifest Structure** (`/scripts/generate-manifest.ts`):

```json
{
  "version": "1.2.3",
  "files": [
    {
      "filename": "AppName-1.2.3-mac.dmg",
      "url": "https://github.com/owner/repo/releases/download/v1.2.3/...",
      "sha512": "<hash>",
      "size": 12345678
    }
  ],
  "signature": "<base64-ed25519-signature>"
}
```

**Spec-Required Structure** (§4.1):

```json
{
  "version": "1.2.3",
  "createdAt": "2025-01-01T12:00:00Z",
  "artifacts": [
    {
      "platform": "macos",
      "type": "dmg",
      "filename": "AppName-1.2.3-mac.dmg",
      "sha256": "<hex-encoded-sha256>",
      "size": 12345678,
      "url": "https://github.com/owner/repo/releases/download/v1.2.3/..."
    },
    {
      "platform": "linux",
      "type": "AppImage",
      "filename": "AppName-1.2.3.AppImage",
      "sha256": "<hex-encoded-sha256>",
      "size": 23456789,
      "url": "https://github.com/owner/repo/releases/download/v1.2.3/..."
    }
  ],
  "signature": "<base64-ed25519-signature>"
}
```

#### Remediation

**Update manifest structure to match spec:**

1. **Update TypeScript Types** (`/src/shared/types.ts`)

   ```typescript
   export interface ManifestArtifact {
     platform: 'macos' | 'linux' | 'windows';
     type: 'dmg' | 'zip' | 'AppImage' | 'exe';
     filename: string;
     sha256: string;  // Changed from sha512
     size: number;
     url: string;
   }

   export interface SignedManifest {
     version: string;
     createdAt: string;  // ISO 8601 timestamp (NEW)
     artifacts: ManifestArtifact[];  // Changed from 'files'
     signature: string;
   }
   ```

2. **Update Manifest Generation Script** (`/scripts/generate-manifest.ts`)

   ```typescript
   import * as crypto from 'crypto';
   import * as fs from 'fs';
   import * as path from 'path';
   import * as nacl from 'tweetnacl';

   interface ManifestArtifact {
     platform: 'macos' | 'linux';
     type: 'dmg' | 'zip' | 'AppImage';
     filename: string;
     sha256: string;
     size: number;
     url: string;
   }

   interface UnsignedManifest {
     version: string;
     createdAt: string;
     artifacts: ManifestArtifact[];
   }

   interface SignedManifest extends UnsignedManifest {
     signature: string;
   }

   // Platform and type detection from filename
   function detectArtifactType(filename: string): { platform: string; type: string } | null {
     if (filename.includes('-mac.') && filename.endsWith('.dmg')) {
       return { platform: 'macos', type: 'dmg' };
     }
     if (filename.includes('-mac.') && filename.endsWith('.zip')) {
       return { platform: 'macos', type: 'zip' };
     }
     if (filename.endsWith('.AppImage')) {
       return { platform: 'linux', type: 'AppImage' };
     }
     return null;
   }

   async function generateManifest() {
     const releaseDir = path.join(__dirname, '../release');
     const version = process.env.npm_package_version || '0.0.0';
     const tag = `v${version}`;
     const owner = process.env.GITHUB_REPOSITORY_OWNER || '';
     const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] || '';

     // Scan release directory for artifacts
     const files = fs.readdirSync(releaseDir).filter(f => {
       return f.endsWith('.dmg') || f.endsWith('.zip') || f.endsWith('.AppImage');
     });

     const artifacts: ManifestArtifact[] = [];

     for (const file of files) {
       const filePath = path.join(releaseDir, file);
       const content = fs.readFileSync(filePath);
       const stats = fs.statSync(filePath);

       // Compute SHA-256 hash (CHANGED from sha512)
       const hash = crypto.createHash('sha256').update(content).digest('hex');

       // Detect platform and type
       const typeInfo = detectArtifactType(file);
       if (!typeInfo) {
         console.warn(`Skipping unknown artifact type: ${file}`);
         continue;
       }

       artifacts.push({
         platform: typeInfo.platform as 'macos' | 'linux',
         type: typeInfo.type as 'dmg' | 'zip' | 'AppImage',
         filename: file,
         sha256: hash,  // Changed from sha512
         size: stats.size,
         url: `https://github.com/${owner}/${repo}/releases/download/${tag}/${file}`,
       });
     }

     // Create unsigned manifest
     const unsignedManifest: UnsignedManifest = {
       version,
       createdAt: new Date().toISOString(),  // NEW FIELD
       artifacts,  // Changed from 'files'
     };

     // Sign manifest
     const privateKeyBase64 = process.env.SIGNING_KEY;
     if (!privateKeyBase64) {
       throw new Error('SIGNING_KEY environment variable not set');
     }

     const privateKey = Buffer.from(privateKeyBase64, 'base64');
     const message = Buffer.from(JSON.stringify(unsignedManifest, null, 2));
     const signature = nacl.sign.detached(message, privateKey);

     const signedManifest: SignedManifest = {
       ...unsignedManifest,
       signature: Buffer.from(signature).toString('base64'),
     };

     // Write manifest
     const manifestPath = path.join(releaseDir, 'manifest.json');
     fs.writeFileSync(manifestPath, JSON.stringify(signedManifest, null, 2));

     console.log('Manifest generated successfully:');
     console.log(`  Version: ${version}`);
     console.log(`  Created: ${unsignedManifest.createdAt}`);
     console.log(`  Artifacts: ${artifacts.length}`);
     artifacts.forEach(a => {
       console.log(`    - ${a.platform}/${a.type}: ${a.filename}`);
     });
   }

   generateManifest().catch(error => {
     console.error('Failed to generate manifest:', error);
     process.exit(1);
   });
   ```

3. **Update Verification Logic** (`/src/main/index.ts`)

   ```typescript
   async function verifyManifest(manifest: SignedManifest): Promise<boolean> {
     try {
       // 1. Version comparison
       const currentVersion = app.getVersion();
       if (!semver.gt(manifest.version, currentVersion)) {
         log('warn', 'Manifest version not greater than current', {
           manifest: manifest.version,
           current: currentVersion,
         });
         return false;
       }

       // 2. Validate createdAt timestamp (NEW)
       const createdAt = new Date(manifest.createdAt);
       if (isNaN(createdAt.getTime())) {
         log('error', 'Invalid createdAt timestamp in manifest');
         return false;
       }

       // 3. Validate artifacts array (changed from 'files')
       if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
         log('error', 'Manifest has no artifacts');
         return false;
       }

       // 4. Extract signature
       const signature = Buffer.from(manifest.signature, 'base64');

       // 5. Create manifest copy without signature
       const { signature: _, ...unsignedManifest } = manifest;

       // 6. Verify Ed25519 signature
       const publicKey = Buffer.from(PUBLIC_KEY, 'base64');
       const message = Buffer.from(JSON.stringify(unsignedManifest, null, 2));
       const valid = nacl.sign.detached.verify(message, signature, publicKey);

       if (!valid) {
         log('error', 'Manifest signature verification failed');
         return false;
       }

       log('info', 'Manifest verification successful', {
         version: manifest.version,
         createdAt: manifest.createdAt,
         artifacts: manifest.artifacts.length,
       });

       return true;
     } catch (error) {
       log('error', 'Manifest verification failed', { error });
       return false;
     }
   }

   async function verifyArtifact(
     filePath: string,
     manifestEntry: ManifestArtifact  // Changed from ManifestFile
   ): Promise<boolean> {
     try {
       const fileContent = fs.readFileSync(filePath);

       // Changed from sha512 to sha256
       const computedHash = crypto
         .createHash('sha256')
         .update(fileContent)
         .digest('hex');

       // Changed field name from sha512 to sha256
       if (computedHash !== manifestEntry.sha256) {
         log('error', 'Artifact hash mismatch', {
           filename: manifestEntry.filename,
           expected: manifestEntry.sha256,
           computed: computedHash,
         });
         return false;
       }

       log('info', 'Artifact verification successful', {
         filename: manifestEntry.filename,
         platform: manifestEntry.platform,
         type: manifestEntry.type,
       });

       return true;
     } catch (error) {
       log('error', 'Artifact verification failed', { error });
       return false;
     }
   }
   ```

4. **Update Artifact Lookup Logic**

   ```typescript
   function findArtifactForCurrentPlatform(
     manifest: SignedManifest
   ): ManifestArtifact | null {
     const currentPlatform = process.platform === 'darwin' ? 'macos' : 'linux';

     // Find artifact matching current platform
     const artifact = manifest.artifacts.find(a => a.platform === currentPlatform);

     if (!artifact) {
       log('error', 'No artifact found for current platform', {
         platform: currentPlatform,
         available: manifest.artifacts.map(a => a.platform),
       });
       return null;
     }

     return artifact;
   }
   ```

#### Acceptance Criteria

- [ ] Manifest uses `artifacts` array (not `files`)
- [ ] Each artifact has `platform` and `type` fields
- [ ] Manifest includes `createdAt` ISO 8601 timestamp
- [ ] Field names match spec exactly
- [ ] Hash field is `sha256` (not `sha512`)
- [ ] Verification code updated for new structure
- [ ] Platform detection logic works for all artifact types
- [ ] TypeScript types enforce correct structure

---

### GAP-009: Missing Download Progress Display

**Severity:** 🟡 SHOULD FIX
**Spec Reference:** §3.1, §3.2
**Impact:** Poor UX during downloads; no visibility into progress.

#### Current State

**File:** `/src/main/index.ts:112-115`

```typescript
autoUpdater.on('download-progress', (progressObj) => {
  updateState.phase = 'downloading';
  mainWindow?.webContents.send('update-state', updateState);
});
```

**Spec Requirement** (§3.1, step 4):
> "Sidebar shows progress: percentage and/or bytes"

#### Remediation

**Capture and forward progress data:**

1. **Update State Interface** (`/src/shared/types.ts`)

   ```typescript
   export interface DownloadProgress {
     percent: number;           // 0-100
     transferred: number;       // Bytes downloaded
     total?: number;            // Total bytes (may be unknown)
     bytesPerSecond?: number;   // Download speed
   }

   export interface UpdateState {
     phase: UpdatePhase;
     availableVersion?: string;
     progress?: DownloadProgress;  // Add this
     lastUpdateCheck?: string;
     errorMessage?: string;
   }
   ```

2. **Update Progress Handler** (`/src/main/index.ts`)

   ```typescript
   autoUpdater.on('download-progress', (progressObj) => {
     updateState.phase = 'downloading';
     updateState.progress = {
       percent: Math.round(progressObj.percent * 10) / 10,  // Round to 1 decimal
       transferred: progressObj.transferred,
       total: progressObj.total,
       bytesPerSecond: progressObj.bytesPerSecond,
     };

     mainWindow?.webContents.send('update-state', updateState);

     // Log occasionally (every 10%)
     const percent = Math.floor(progressObj.percent);
     if (percent % 10 === 0) {
       log('info', 'Download progress', {
         percent: `${percent}%`,
         transferred: formatBytes(progressObj.transferred),
         total: formatBytes(progressObj.total),
       });
     }
   });

   // Utility function
   function formatBytes(bytes: number): string {
     if (bytes < 1024) return `${bytes} B`;
     if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
     if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
     return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
   }
   ```

3. **Update Renderer UI** (`/src/renderer/main.tsx`)

   ```typescript
   // In Sidebar component
   {phase === 'downloading' && updateState.progress && (
     <div className="download-progress">
       {/* Progress bar */}
       <div className="progress-bar-container">
         <div
           className="progress-bar-fill"
           style={{ width: `${updateState.progress.percent}%` }}
         />
       </div>

       {/* Progress text */}
       <div className="progress-text">
         <span className="progress-percent">
           {updateState.progress.percent.toFixed(1)}%
         </span>
         <span className="progress-bytes">
           {formatBytes(updateState.progress.transferred)}
           {updateState.progress.total &&
             ` / ${formatBytes(updateState.progress.total)}`
           }
         </span>
         {updateState.progress.bytesPerSecond && (
           <span className="progress-speed">
             {formatBytes(updateState.progress.bytesPerSecond)}/s
           </span>
         )}
       </div>
     </div>
   )}

   // Utility function in renderer
   function formatBytes(bytes: number): string {
     if (bytes < 1024) return `${bytes} B`;
     if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
     if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
     return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
   }
   ```

4. **Add Progress Bar Styles** (`/src/renderer/styles.css`)

   ```css
   .download-progress {
     margin-top: 1rem;
   }

   .progress-bar-container {
     width: 100%;
     height: 8px;
     background: rgba(255, 255, 255, 0.1);
     border-radius: 4px;
     overflow: hidden;
     margin-bottom: 0.5rem;
   }

   .progress-bar-fill {
     height: 100%;
     background: linear-gradient(90deg, #4a9eff, #6b5ce7);
     transition: width 0.3s ease;
     border-radius: 4px;
   }

   .progress-text {
     display: flex;
     justify-content: space-between;
     font-size: 0.875rem;
     color: rgba(255, 255, 255, 0.7);
   }

   .progress-percent {
     font-weight: 600;
     color: rgba(255, 255, 255, 0.9);
   }

   .progress-speed {
     font-style: italic;
   }
   ```

5. **Clear Progress on Complete**

   ```typescript
   autoUpdater.on('update-downloaded', async (info) => {
     log('info', 'Update downloaded, starting verification');
     updateState.phase = 'verifying';
     updateState.progress = undefined;  // Clear progress
     mainWindow?.webContents.send('update-state', updateState);

     // ... verification logic
   });
   ```

#### Enhanced Progress Tracking

For large downloads, add estimated time remaining:

```typescript
let downloadStartTime: number | null = null;

autoUpdater.on('update-available', () => {
  downloadStartTime = Date.now();
});

autoUpdater.on('download-progress', (progressObj) => {
  const elapsed = Date.now() - (downloadStartTime || Date.now());
  const rate = progressObj.transferred / (elapsed / 1000);  // bytes/sec
  const remaining = (progressObj.total - progressObj.transferred) / rate;  // seconds

  updateState.progress = {
    percent: Math.round(progressObj.percent * 10) / 10,
    transferred: progressObj.transferred,
    total: progressObj.total,
    bytesPerSecond: rate,
    estimatedSecondsRemaining: Math.round(remaining),
  };

  // ...
});
```

Display in UI:
```typescript
{progress.estimatedSecondsRemaining && (
  <span className="progress-eta">
    {formatDuration(progress.estimatedSecondsRemaining)} remaining
  </span>
)}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
```

#### Acceptance Criteria

- [ ] Download progress captured from electron-updater
- [ ] Progress includes percent, transferred bytes, total bytes
- [ ] Progress bar visually displayed in sidebar
- [ ] Progress text shows formatted bytes (KB/MB/GB)
- [ ] Download speed displayed (optional)
- [ ] Progress cleared on download complete
- [ ] Progress updates smoothly (not jittery)
- [ ] UI handles missing total size gracefully

---

## 5. TIER 3 - Nice to Have Issues

### GAP-010: Monolithic Component Structure

**Severity:** 🟢 NICE TO HAVE
**Spec Reference:** §2.4
**Impact:** Code organization doesn't follow spec structure; harder to maintain as app grows.

#### Current State

**Single File Implementation:**
- `/src/renderer/main.tsx` (5,095 bytes): All UI components inline
- `/src/main/index.ts` (199 lines): All main process logic

**Spec Structure** (§2.4):
```
/src/main
  /update          # auto-update orchestration
  /security        # Ed25519 verification
  /ipc             # IPC handlers
  /config          # config management (✓ exists)
  /logging         # logging (✓ exists)
  main.ts          # bootstrap

/src/renderer
  /layout          # Header, Footer, Sidebar, MainContent
  /components      # Button, Card, Panel
  /features
    /status        # StatusDashboard
    /updates       # UpdateIndicator
```

#### Remediation

**Refactor into modular structure:**

1. **Main Process Modularization**

   Create `/src/main/update/index.ts`:
   ```typescript
   import { autoUpdater } from 'electron-updater';
   import type { BrowserWindow } from 'electron';
   import { log } from '../logging';
   import type { UpdateState } from '../../shared/types';

   export function initializeUpdater(mainWindow: BrowserWindow, config: any) {
     // ... autoUpdater setup
   }

   export function checkForUpdates() {
     return autoUpdater.checkForUpdates();
   }

   export function downloadUpdate() {
     return autoUpdater.downloadUpdate();
   }

   export function quitAndInstall() {
     return autoUpdater.quitAndInstall();
   }
   ```

   Create `/src/main/security/verify.ts`:
   ```typescript
   import type { SignedManifest, ManifestArtifact } from '../../shared/types';

   export async function verifyManifest(manifest: SignedManifest): Promise<boolean> {
     // ... verification logic
   }

   export async function verifyArtifact(
     filePath: string,
     entry: ManifestArtifact
   ): Promise<boolean> {
     // ... hash verification
   }
   ```

   Create `/src/main/ipc/handlers.ts`:
   ```typescript
   import { ipcMain } from 'electron';
   import { checkForUpdates, downloadUpdate, quitAndInstall } from '../update';
   import { loadConfig, updateConfig } from '../config';
   import { getRecentLogs } from '../logging';

   export function registerIPCHandlers() {
     // Updates domain
     ipcMain.handle('updates:check', checkForUpdates);
     ipcMain.handle('updates:download', downloadUpdate);
     ipcMain.handle('updates:restart', quitAndInstall);

     // Config domain
     ipcMain.handle('config:get', loadConfig);
     ipcMain.handle('config:update', (_event, patch) => updateConfig(patch));

     // Logs domain
     ipcMain.handle('logs:get-recent', (_event, limit) => getRecentLogs(limit));

     // ... other handlers
   }
   ```

   Update `/src/main/main.ts` (formerly index.ts):
   ```typescript
   import { app, BrowserWindow } from 'electron';
   import { initializeUpdater } from './update';
   import { registerIPCHandlers } from './ipc/handlers';
   import { initializeLogging } from './logging';
   import { loadConfig } from './config';

   async function createWindow() {
     const config = await loadConfig();
     initializeLogging(config.logLevel);

     const mainWindow = new BrowserWindow({
       // ... window config
     });

     registerIPCHandlers();
     initializeUpdater(mainWindow, config);

     mainWindow.loadFile('dist-renderer/index.html');
   }

   app.whenReady().then(createWindow);
   ```

2. **Renderer Component Extraction**

   Create `/src/renderer/layout/Header.tsx`:
   ```typescript
   export function Header() {
     return (
       <header className="header">
         <h1>SlimChat Bootstrap</h1>
         <p className="subtitle">Secure Self-Updating Desktop App</p>
       </header>
     );
   }
   ```

   Create `/src/renderer/layout/Footer.tsx`:
   ```typescript
   interface FooterProps {
     version: string;
     platform: string;
   }

   export function Footer({ version, platform }: FooterProps) {
     return (
       <footer className="footer">
         <span>v{version}</span>
         <span>{platform}</span>
         <span>Ed25519 Signed Updates</span>
       </footer>
     );
   }
   ```

   Create `/src/renderer/layout/Sidebar.tsx`:
   ```typescript
   import { UpdateIndicator } from '../features/updates/UpdateIndicator';

   interface SidebarProps {
     updateState: UpdateState;
     onCheckForUpdates: () => void;
     onDownloadUpdate: () => void;
     onRestartToUpdate: () => void;
   }

   export function Sidebar({ updateState, ...handlers }: SidebarProps) {
     return (
       <aside className="sidebar">
         <nav className="sidebar-nav">
           <div className="nav-item active">Status</div>
         </nav>

         <UpdateIndicator state={updateState} {...handlers} />
       </aside>
     );
   }
   ```

   Create `/src/renderer/features/updates/UpdateIndicator.tsx`:
   ```typescript
   import type { UpdateState } from '../../../shared/types';
   import { ProgressBar } from '../../components/ProgressBar';

   interface UpdateIndicatorProps {
     state: UpdateState;
     onCheckForUpdates: () => void;
     onDownloadUpdate: () => void;
     onRestartToUpdate: () => void;
   }

   export function UpdateIndicator({ state, ...handlers }: UpdateIndicatorProps) {
     // ... update UI logic
   }
   ```

   Create `/src/renderer/features/status/StatusDashboard.tsx`:
   ```typescript
   import { SystemInfoCard } from './SystemInfoCard';
   import { UpdateStatusCard } from './UpdateStatusCard';
   import { RecentLogsCard } from './RecentLogsCard';

   export function StatusDashboard({ appStatus }: { appStatus: AppStatus }) {
     return (
       <main className="main-content">
         <h2>System Status</h2>
         <div className="cards-grid">
           <SystemInfoCard info={appStatus.systemInfo} />
           <UpdateStatusCard state={appStatus.updateState} />
           <RecentLogsCard logs={appStatus.recentLogs} />
         </div>
       </main>
     );
   }
   ```

   Create `/src/renderer/components/ProgressBar.tsx`:
   ```typescript
   interface ProgressBarProps {
     percent: number;
     showLabel?: boolean;
   }

   export function ProgressBar({ percent, showLabel = true }: ProgressBarProps) {
     return (
       <div className="progress-bar-container">
         <div
           className="progress-bar-fill"
           style={{ width: `${percent}%` }}
         />
         {showLabel && (
           <span className="progress-label">{percent.toFixed(1)}%</span>
         )}
       </div>
     );
   }
   ```

   Update `/src/renderer/main.tsx`:
   ```typescript
   import { Header } from './layout/Header';
   import { Footer } from './layout/Footer';
   import { Sidebar } from './layout/Sidebar';
   import { StatusDashboard } from './features/status/StatusDashboard';

   function App() {
     const [appStatus, setAppStatus] = useState<AppStatus | null>(null);

     // ... hooks and effects

     return (
       <div className="app-container">
         <Header />
         <div className="app-body">
           <Sidebar
             updateState={appStatus.updateState}
             onCheckForUpdates={handleCheckForUpdates}
             onDownloadUpdate={handleDownloadUpdate}
             onRestartToUpdate={handleRestartToUpdate}
           />
           <StatusDashboard appStatus={appStatus} />
         </div>
         <Footer
           version={appStatus.version}
           platform={appStatus.platform}
         />
       </div>
     );
   }
   ```

#### Benefits

- **Maintainability**: Easier to locate and modify specific features
- **Testability**: Smaller modules easier to unit test
- **Collaboration**: Multiple developers can work on different modules
- **Scalability**: Clear structure for adding new features
- **Spec Compliance**: Matches documented architecture

#### Acceptance Criteria

- [ ] Main process split into domain modules (update, security, ipc, config, logging)
- [ ] Renderer components extracted to separate files
- [ ] Layout components in `/src/renderer/layout/`
- [ ] Feature components in `/src/renderer/features/`
- [ ] Shared components in `/src/renderer/components/`
- [ ] No change in functionality
- [ ] Build and app startup still work
- [ ] Directory structure matches spec §2.4

---

### GAP-011: No Log Rotation

**Severity:** 🟢 NICE TO HAVE
**Spec Reference:** §3.4
**Impact:** Log files grow unbounded; can consume disk space over time.

#### Current State

**File:** `/src/main/logging.ts`

- Single log file: `logs/app.log`
- No size limit
- No rotation strategy
- No cleanup of old logs

#### Remediation

**Implement daily rotation with retention policy:**

1. **Install winston for Log Management**

   ```bash
   npm install winston winston-daily-rotate-file
   npm install --save-dev @types/winston
   ```

2. **Update Logging Module** (`/src/main/logging.ts`)

   ```typescript
   import * as winston from 'winston';
   import * as DailyRotateFile from 'winston-daily-rotate-file';
   import * as path from 'path';
   import { app } from 'electron';

   let logger: winston.Logger;

   export function initializeLogging(logLevel: string = 'info') {
     const logDir = path.join(
       app.getPath('userData'),
       'logs'
     );

     // Daily rotation with retention
     const dailyRotateTransport = new DailyRotateFile({
       dirname: logDir,
       filename: 'app-%DATE%.log',
       datePattern: 'YYYY-MM-DD',
       maxSize: '10m',      // Rotate if file exceeds 10MB
       maxFiles: '14d',     // Keep logs for 14 days
       format: winston.format.combine(
         winston.format.timestamp(),
         winston.format.json()
       ),
     });

     // Console output for development
     const consoleTransport = new winston.transports.Console({
       format: winston.format.combine(
         winston.format.colorize(),
         winston.format.simple()
       ),
     });

     logger = winston.createLogger({
       level: logLevel,
       transports: [
         dailyRotateTransport,
         consoleTransport,
       ],
     });

     // Log rotation events
     dailyRotateTransport.on('rotate', (oldFilename, newFilename) => {
       logger.info('Log rotated', { oldFilename, newFilename });
     });

     logger.info('Logging initialized', { logLevel, logDir });
   }

   export function log(
     level: 'debug' | 'info' | 'warn' | 'error',
     message: string,
     context?: Record<string, unknown>
   ) {
     if (!logger) {
       console.error('Logger not initialized');
       return;
     }

     logger.log(level, message, context);
   }

   export function getRecentLogs(limit: number = 200): LogEntry[] {
     // Read from current day's log file
     const logDir = path.join(app.getPath('userData'), 'logs');
     const today = new Date().toISOString().split('T')[0];
     const logFile = path.join(logDir, `app-${today}.log`);

     if (!fs.existsSync(logFile)) {
       return [];
     }

     const content = fs.readFileSync(logFile, 'utf-8');
     const lines = content.trim().split('\n');
     const recentLines = lines.slice(-limit);

     return recentLines.map(line => {
       try {
         return JSON.parse(line);
       } catch {
         return {
           timestamp: new Date().toISOString(),
           level: 'info',
           message: line,
         };
       }
     });
   }
   ```

3. **Add Configuration Options** (`/src/shared/types.ts`)

   ```typescript
   export interface Config {
     autoUpdate: boolean;
     allowPrerelease: boolean;
     updateCheckIntervalHours: number;
     logLevel: 'debug' | 'info' | 'warn' | 'error';
     logRetentionDays: number;     // NEW
     logMaxFileSizeMB: number;     // NEW
   }
   ```

   Default config:
   ```typescript
   const DEFAULT_CONFIG: Config = {
     autoUpdate: true,
     allowPrerelease: false,
     updateCheckIntervalHours: 0,
     logLevel: 'info',
     logRetentionDays: 14,
     logMaxFileSizeMB: 10,
   };
   ```

4. **Manual Cleanup on Startup**

   ```typescript
   import * as fs from 'fs';
   import * as path from 'path';

   export function cleanupOldLogs(retentionDays: number) {
     const logDir = path.join(app.getPath('userData'), 'logs');

     if (!fs.existsSync(logDir)) {
       return;
     }

     const now = Date.now();
     const maxAge = retentionDays * 24 * 60 * 60 * 1000;

     const files = fs.readdirSync(logDir);

     for (const file of files) {
       if (!file.startsWith('app-') || !file.endsWith('.log')) {
         continue;
       }

       const filePath = path.join(logDir, file);
       const stats = fs.statSync(filePath);
       const age = now - stats.mtimeMs;

       if (age > maxAge) {
         fs.unlinkSync(filePath);
         console.log(`Deleted old log file: ${file}`);
       }
     }
   }

   // Call on app startup
   app.whenReady().then(() => {
     const config = loadConfig();
     cleanupOldLogs(config.logRetentionDays);
     initializeLogging(config.logLevel);
   });
   ```

#### Alternative: Simple Size-Based Rotation

If not using winston, implement basic rotation:

```typescript
export function log(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>
) {
  const logPath = getLogFilePath();

  // Check file size before writing
  if (fs.existsSync(logPath)) {
    const stats = fs.statSync(logPath);
    const maxSize = 10 * 1024 * 1024;  // 10MB

    if (stats.size > maxSize) {
      // Rotate: rename current to .old
      const oldPath = `${logPath}.old`;
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);  // Delete previous .old
      }
      fs.renameSync(logPath, oldPath);
    }
  }

  // Write log entry
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };

  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
}
```

#### Acceptance Criteria

- [ ] Log files rotate daily or when size limit reached
- [ ] Old logs automatically deleted after retention period
- [ ] Retention period configurable (default 14 days)
- [ ] Max file size configurable (default 10MB)
- [ ] App startup triggers cleanup of old logs
- [ ] Rotation events logged
- [ ] No disk space exhaustion from unbounded logs

---

### GAP-012: No Test Suite

**Severity:** 🟢 NICE TO HAVE
**Spec Reference:** §2.4 (mentions `/tests` directory)
**Impact:** No automated verification of critical security logic; harder to refactor safely.

#### Current State

- No test files
- No test runner configured
- No CI test step (beyond linting)

#### Remediation

**Add unit tests for critical paths:**

1. **Install Test Dependencies**

   ```bash
   npm install --save-dev vitest @vitest/ui
   npm install --save-dev @types/node
   ```

2. **Configure Vitest** (`vitest.config.ts`)

   ```typescript
   import { defineConfig } from 'vitest/config';

   export default defineConfig({
     test: {
       globals: true,
       environment: 'node',
       include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
       coverage: {
         provider: 'v8',
         reporter: ['text', 'json', 'html'],
         include: ['src/main/**/*.ts', 'src/shared/**/*.ts'],
       },
     },
   });
   ```

3. **Add Test Scripts** (`package.json`)

   ```json
   {
     "scripts": {
       "test": "vitest run",
       "test:watch": "vitest",
       "test:ui": "vitest --ui",
       "test:coverage": "vitest run --coverage"
     }
   }
   ```

4. **Create Verification Tests** (`tests/security/verify.test.ts`)

   ```typescript
   import { describe, it, expect, beforeEach } from 'vitest';
   import * as crypto from 'crypto';
   import * as nacl from 'tweetnacl';
   import type { SignedManifest } from '../../src/shared/types';

   describe('Manifest Verification', () => {
     let keypair: nacl.SignKeyPair;
     let publicKey: string;
     let privateKey: Uint8Array;

     beforeEach(() => {
       keypair = nacl.sign.keyPair();
       publicKey = Buffer.from(keypair.publicKey).toString('base64');
       privateKey = keypair.secretKey;
     });

     function signManifest(manifest: Omit<SignedManifest, 'signature'>): SignedManifest {
       const message = Buffer.from(JSON.stringify(manifest));
       const signature = nacl.sign.detached(message, privateKey);
       return {
         ...manifest,
         signature: Buffer.from(signature).toString('base64'),
       };
     }

     function verifyManifest(manifest: SignedManifest, pubKey: string): boolean {
       try {
         const signature = Buffer.from(manifest.signature, 'base64');
         const { signature: _, ...unsignedManifest } = manifest;
         const message = Buffer.from(JSON.stringify(unsignedManifest));
         const publicKeyBuffer = Buffer.from(pubKey, 'base64');

         return nacl.sign.detached.verify(message, signature, publicKeyBuffer);
       } catch {
         return false;
       }
     }

     it('should verify valid manifest signature', () => {
       const manifest = signManifest({
         version: '1.0.0',
         createdAt: new Date().toISOString(),
         artifacts: [],
       });

       expect(verifyManifest(manifest, publicKey)).toBe(true);
     });

     it('should reject manifest with tampered version', () => {
       const manifest = signManifest({
         version: '1.0.0',
         createdAt: new Date().toISOString(),
         artifacts: [],
       });

       // Tamper with version
       manifest.version = '2.0.0';

       expect(verifyManifest(manifest, publicKey)).toBe(false);
     });

     it('should reject manifest with invalid signature format', () => {
       const manifest: SignedManifest = {
         version: '1.0.0',
         createdAt: new Date().toISOString(),
         artifacts: [],
         signature: 'invalid-base64!!!',
       };

       expect(verifyManifest(manifest, publicKey)).toBe(false);
     });

     it('should reject manifest signed with different key', () => {
       const manifest = signManifest({
         version: '1.0.0',
         createdAt: new Date().toISOString(),
         artifacts: [],
       });

       // Try to verify with different public key
       const otherKeypair = nacl.sign.keyPair();
       const otherPublicKey = Buffer.from(otherKeypair.publicKey).toString('base64');

       expect(verifyManifest(manifest, otherPublicKey)).toBe(false);
     });
   });

   describe('Artifact Hash Verification', () => {
     it('should verify matching SHA-256 hash', () => {
       const content = 'test file content';
       const buffer = Buffer.from(content);

       const expectedHash = crypto
         .createHash('sha256')
         .update(buffer)
         .digest('hex');

       const computedHash = crypto
         .createHash('sha256')
         .update(buffer)
         .digest('hex');

       expect(computedHash).toBe(expectedHash);
     });

     it('should reject mismatched hash', () => {
       const content1 = 'original content';
       const content2 = 'modified content';

       const hash1 = crypto
         .createHash('sha256')
         .update(Buffer.from(content1))
         .digest('hex');

       const hash2 = crypto
         .createHash('sha256')
         .update(Buffer.from(content2))
         .digest('hex');

       expect(hash1).not.toBe(hash2);
     });
   });
   ```

5. **Create Version Comparison Tests** (`tests/security/version.test.ts`)

   ```typescript
   import { describe, it, expect } from 'vitest';
   import semver from 'semver';

   describe('Version Comparison', () => {
     it('should accept higher major version', () => {
       expect(semver.gt('2.0.0', '1.0.0')).toBe(true);
     });

     it('should accept higher minor version', () => {
       expect(semver.gt('1.1.0', '1.0.0')).toBe(true);
     });

     it('should accept higher patch version', () => {
       expect(semver.gt('1.0.1', '1.0.0')).toBe(true);
     });

     it('should reject equal versions', () => {
       expect(semver.gt('1.0.0', '1.0.0')).toBe(false);
     });

     it('should reject lower versions', () => {
       expect(semver.gt('1.0.0', '2.0.0')).toBe(false);
     });

     it('should reject invalid versions', () => {
       expect(semver.valid('invalid')).toBe(null);
     });
   });
   ```

6. **Add CI Test Step** (`.github/workflows/test.yml`)

   ```yaml
   name: Test

   on:
     push:
       branches: [main, dev]
     pull_request:
       branches: [main, dev]

   jobs:
     test:
       runs-on: ubuntu-latest

       steps:
         - uses: actions/checkout@v4

         - name: Setup Node.js
           uses: actions/setup-node@v4
           with:
             node-version: '18'
             cache: 'npm'

         - name: Install dependencies
           run: npm ci

         - name: Run linter
           run: npm run lint

         - name: Run tests
           run: npm run test:coverage

         - name: Upload coverage
           uses: codecov/codecov-action@v3
           with:
             files: ./coverage/coverage-final.json
   ```

#### Test Coverage Goals

**Phase 1 (Minimum):**
- Ed25519 signature verification
- SHA-256 hash verification
- Version comparison logic

**Phase 2 (Recommended):**
- Config loading/saving
- Log entry parsing
- IPC message validation

**Phase 3 (Complete):**
- Update state machine
- Error handling
- Edge cases

#### Acceptance Criteria

- [ ] Test runner configured (Vitest)
- [ ] Unit tests for manifest verification
- [ ] Unit tests for artifact hash verification
- [ ] Unit tests for version comparison
- [ ] Tests run in CI
- [ ] Coverage report generated
- [ ] All tests pass

---

## 6. Implementation Priority & Roadmap

### Phase 1: Critical Fixes (Required for v1.0.0)

**Goal:** Make the update pipeline functional and secure.

**Tasks:**
1. ✅ GAP-001: Fix hash algorithm (SHA-512 → SHA-256)
2. ✅ GAP-002: Add GitHub Release creation to CI
3. ✅ GAP-003: Fill in GitHub config (owner/repo)
4. ✅ GAP-004: Ensure manifest uploaded to releases

**Estimated Effort:** 4-6 hours
**Validation:** End-to-end update test with real GitHub Release

---

### Phase 2: Spec Compliance (Recommended for v1.0.0)

**Goal:** Align implementation with spec requirements.

**Tasks:**
5. ✅ GAP-005: Disable auto-download, add manual control
6. ✅ GAP-006: Add version comparison in verification
7. ✅ GAP-007: Refactor IPC API to nested structure
8. ✅ GAP-008: Update manifest JSON structure
9. ✅ GAP-009: Add download progress display

**Estimated Effort:** 8-12 hours
**Validation:** Spec compliance audit

---

### Phase 3: Quality Improvements (Post v1.0.0)

**Goal:** Improve maintainability and user experience.

**Tasks:**
10. ⏳ GAP-010: Refactor to modular structure
11. ⏳ GAP-011: Add log rotation
12. ⏳ GAP-012: Add test suite

**Estimated Effort:** 12-16 hours
**Validation:** Code review, test coverage report

---

## 7. Testing & Validation Strategy

### 7.1 Unit Testing

**Critical Security Functions:**
- Ed25519 signature verification
- SHA-256 hash computation
- Version comparison
- Manifest structure validation

**Test Framework:** Vitest
**Coverage Goal:** >80% for security modules

### 7.2 Integration Testing

**Update Flow End-to-End:**

1. **Setup Test Environment:**
   - Create test repository with sample releases
   - Generate test signing keypair
   - Build test app with embedded test public key

2. **Test Scenarios:**
   - ✅ Update available → download → verify → install
   - ✅ No update available
   - ✅ Network error during check
   - ✅ Invalid manifest signature
   - ✅ Hash mismatch
   - ✅ Version downgrade attempt

3. **Validation Criteria:**
   - All logs captured
   - UI state reflects actual state
   - No crashes or hangs
   - Update applied correctly

### 7.3 Manual Testing Checklist

**macOS:**
- [ ] Initial install (bypass Gatekeeper)
- [ ] App starts and shows UI
- [ ] Check for updates succeeds
- [ ] Download update with progress
- [ ] Verify and install update
- [ ] App restarts with new version

**Linux (AppImage):**
- [ ] AppImage runs without installation
- [ ] Update check succeeds
- [ ] Download and install update
- [ ] App restarts with new version

**Error Cases:**
- [ ] Network disconnected during check
- [ ] Corrupted manifest
- [ ] Tampered artifact
- [ ] Disk space full

### 7.4 CI Validation

**Pre-release Checks:**
- [ ] Linting passes
- [ ] Unit tests pass
- [ ] Builds complete for all platforms
- [ ] Manifest generated successfully
- [ ] Signature valid
- [ ] Artifacts uploaded to release
- [ ] Release created successfully

---

## 8. Migration & Deployment

### 8.1 For Existing Installations

If any releases were published before fixes:

1. **Version Bump:**
   - Increment to v1.0.0 after fixes
   - Mark all previous versions as deprecated

2. **Manual Migration:**
   - Users must manually download v1.0.0
   - Subsequent updates use self-updater

3. **Breaking Changes:**
   - SHA-256 vs SHA-512: All manifests must be regenerated
   - Manifest structure: Clients <1.0.0 incompatible

### 8.2 First Production Release

**Checklist:**

- [ ] All TIER 1 gaps fixed
- [ ] GitHub config filled in with actual repository
- [ ] Signing keypair generated (store private key in GitHub secrets)
- [ ] Public key embedded in app
- [ ] End-to-end test completed
- [ ] Tag v1.0.0 pushed
- [ ] CI creates release successfully
- [ ] Artifacts downloadable and verified
- [ ] Update check works from app

---

## 9. Monitoring & Maintenance

### 9.1 Release Process

**For Each New Version:**

1. Update version in `package.json`
2. Tag with `git tag vX.Y.Z`
3. Push tag: `git push origin vX.Y.Z`
4. CI automatically:
   - Builds artifacts
   - Generates manifest
   - Signs manifest
   - Creates GitHub Release
5. Verify release appears on GitHub
6. Test update from previous version

### 9.2 Key Rotation

**If Private Key Compromised:**

1. Generate new keypair
2. Update public key in codebase
3. Release new version with new key
4. Old versions won't update (breaking change)
5. Notify users to manually install new version

**Recommendation:** Plan for key rotation mechanism in future:
- Embed multiple public keys
- Manifest includes key ID
- App tries all keys until one succeeds

### 9.3 Logging & Diagnostics

**Key Metrics to Monitor:**

- Update check success rate
- Download completion rate
- Verification failure rate
- Installation success rate
- Time to update (download + verify + install)

**Log Analysis:**

- Regularly review error logs for patterns
- Monitor verification failures (potential attacks)
- Track version distribution

---

## 10. Summary

### Critical Path (Blocking v1.0.0)

1. **Hash Algorithm Alignment** (GAP-001)
2. **GitHub Release Integration** (GAP-002, GAP-003, GAP-004)

Without these fixes, the update system is non-functional.

### Recommended Before Launch (Should Fix)

5. **Manual Download Control** (GAP-005)
6. **Version Comparison** (GAP-006)
7. **IPC API Structure** (GAP-007)
8. **Manifest JSON Structure** (GAP-008)
9. **Download Progress Display** (GAP-009)

These ensure spec compliance and security best practices.

### Post-Launch Improvements (Nice to Have)

10. **Modular Structure** (GAP-010)
11. **Log Rotation** (GAP-011)
12. **Test Suite** (GAP-012)

These improve maintainability and long-term quality.

---

## 11. Appendix: Quick Reference

### A. File Modification Checklist

**TIER 1 (Blocking):**
- [ ] `/scripts/generate-manifest.ts` (SHA-256, manifest structure)
- [ ] `/src/main/index.ts` (SHA-256, verification logic)
- [ ] `/src/shared/types.ts` (sha256 field)
- [ ] `.github/workflows/release.yml` (add release creation job)
- [ ] `package.json` (fill owner/repo in build.publish)

**TIER 2 (Should Fix):**
- [ ] `/src/main/index.ts` (autoDownload=false, version check, progress tracking)
- [ ] `/src/preload/index.ts` (nested API structure)
- [ ] `/src/renderer/main.tsx` (download button, progress bar)
- [ ] `/src/shared/types.ts` (nested API types, progress types, manifest updates)

**TIER 3 (Nice to Have):**
- [ ] Refactor into modular files
- [ ] Add winston for log rotation
- [ ] Create test files in `/tests`
- [ ] Add CI test workflow

---

## 12. Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-05 | System | Initial gap analysis and remediation spec |

---

**End of Gap Analysis & Remediation Specification**
