# GitHub Provider Migration - Implementation Specification

## Component: GitHub Provider Migration

### Objective
Switch from version-specific generic provider to electron-updater's GitHub provider for cross-version auto-updates, while preserving dev mode flexibility with file:// URLs.

---

## File 1: src/main/update/controller.ts

### Modification: setupUpdater() function (lines 195-239)

**Current behavior:**
- Uses generic provider for all cases
- Feed URL includes current app version: `https://github.com/{owner}/{repo}/releases/download/v{version}`
- Falls back to manifestUrl if provided
- Dev mode uses devUpdateSource with generic provider

**Required behavior:**
- **Production mode (no dev overrides)**: Use GitHub provider with `owner: '941design'`, `repo: 'slim-chat'`
- **Dev mode (devUpdateSource set)**: Continue using generic provider with `url: devUpdateSource`
- **Remove**: manifestUrl fallback logic

**Implementation algorithm:**

```
CONTRACT for setupUpdater (updated):
  Inputs:
    - autoDownloadEnabled: boolean
    - config: AppConfig (manifestUrl field NO LONGER USED)
    - devConfig: DevUpdateConfig

  Outputs:
    - void (side effect: configures autoUpdater)

  Invariants:
    - Production: use GitHub provider (provider: 'github')
    - Dev mode with devUpdateSource: use generic provider (provider: 'generic')
    - isDevModeActive logic unchanged (production safety C1)
    - Environment variable precedence unchanged

  Algorithm:
    1. Set autoUpdater.autoDownload and autoInstallOnAppQuit (unchanged)

    2. Determine dev mode settings (unchanged):
       - isDevModeActive = devConfig.forceDevUpdateConfig OR Boolean(devConfig.devUpdateSource) OR devConfig.allowPrerelease
       - forceDevUpdateConfig = devConfig.forceDevUpdateConfig OR (isDevModeActive AND config.forceDevUpdateConfig) OR false
       - devUpdateSource = devConfig.devUpdateSource OR (isDevModeActive AND config.devUpdateSource) OR undefined
       - allowPrerelease = devConfig.allowPrerelease OR (isDevModeActive AND config.allowPrerelease) OR false

    3. Set forceDevUpdateConfig and allowPrerelease (unchanged)

    4. NEW: Configure feed URL based on mode:
       IF devUpdateSource is set:
         // Dev mode: use generic provider for file:// URL support
         autoUpdater.setFeedURL({
           provider: 'generic',
           url: devUpdateSource
         })
         log('info', `Dev mode: using custom update source: ${devUpdateSource}`)
       ELSE:
         // Production mode: use GitHub provider
         autoUpdater.setFeedURL({
           provider: 'github',
           owner: '941design',
           repo: 'slim-chat'
         })
         log('info', 'Update feed configured: GitHub provider (941design/slim-chat)')

  Changes from current implementation:
    - REMOVED: config.manifestUrl fallback check
    - REMOVED: version-based URL construction
    - ADDED: GitHub provider for production
    - PRESERVED: generic provider for dev mode with devUpdateSource

  Production safety verification:
    - isDevModeActive check prevents dev config from affecting production
    - GitHub provider only used when NO dev overrides active
    - Dev mode requires explicit environment variable or config setting
```

**Property-based testing requirements:**
- Property: Production mode always uses GitHub provider
- Property: Dev mode with devUpdateSource always uses generic provider
- Property: Precedence order maintained (env > config > default)
- Property: Production safety (dev features never enabled in production builds)

---

## File 2: src/shared/types.ts

### Modification: AppConfig interface (lines 3-13)

**Current definition:**
```typescript
export interface AppConfig {
  autoUpdate: boolean;
  logLevel: LogLevel;
  manifestUrl?: string;  // <-- REMOVE THIS LINE
  autoUpdateBehavior?: 'manual' | 'auto-download';
  logRetentionDays?: number;
  logMaxFileSizeMB?: number;
  forceDevUpdateConfig?: boolean;
  devUpdateSource?: string;
  allowPrerelease?: boolean;
}
```

**Required definition:**
```typescript
export interface AppConfig {
  autoUpdate: boolean;
  logLevel: LogLevel;
  // manifestUrl removed - manifest URL now always derived from GitHub repo
  autoUpdateBehavior?: 'manual' | 'auto-download';
  logRetentionDays?: number;
  logMaxFileSizeMB?: number;
  forceDevUpdateConfig?: boolean;
  devUpdateSource?: string;
  allowPrerelease?: boolean;
}
```

**Change:**
- Remove `manifestUrl?: string;` field completely
- Add comment explaining removal

**Testing requirement:**
- Verify TypeScript compilation succeeds
- Verify existing configs with manifestUrl are gracefully handled (field ignored)

---

## File 3: src/main/integration.ts

### Modification: constructManifestUrl() function (lines 13-77)

**Current signature:**
```typescript
export function constructManifestUrl(
  publishConfig: { owner?: string; repo?: string },
  version: string,
  manifestUrl?: string
): string
```

**Required signature:**
```typescript
export function constructManifestUrl(
  publishConfig: { owner?: string; repo?: string },
  devUpdateSource?: string
): string
```

**Current behavior:**
- If manifestUrl provided, return it unchanged
- Otherwise, construct from publishConfig and version
- URL format: `https://github.com/{owner}/{repo}/releases/download/v{version}/manifest.json`

**Required behavior:**
- **Production mode (no devUpdateSource)**: Always use `/latest/download/` path
- **Dev mode (devUpdateSource provided)**: Append `/manifest.json` to devUpdateSource
- **Remove**: version parameter (no longer version-specific)
- **Remove**: manifestUrl parameter (no longer supported)

**Implementation algorithm:**

```
CONTRACT for constructManifestUrl (updated):
  Inputs:
    - publishConfig: object with optional fields:
      - owner: GitHub username/organization
      - repo: repository name
    - devUpdateSource: optional string (dev mode override URL)

  Outputs:
    - string: manifest URL
    - throws Error if publishConfig incomplete and no devUpdateSource

  Invariants:
    - Production: always uses /latest/download/ path (cross-version discovery)
    - Dev mode: derives URL from devUpdateSource
    - URL format matches electron-updater GitHub provider expectations

  Properties:
    - Cross-version discovery: production URL independent of current version
    - Dev mode flexibility: supports custom URLs including file://
    - GitHub convention: follows electron-updater GitHub provider pattern

  Algorithm:
    1. If devUpdateSource is defined and non-empty:
       a. If devUpdateSource ends with '/':
          - Return devUpdateSource + 'manifest.json'
       b. Else:
          - Return devUpdateSource + '/manifest.json'

    2. Validate publishConfig (production mode):
       a. Extract owner = publishConfig.owner?.trim()
       b. Extract repo = publishConfig.repo?.trim()
       c. If owner is empty or undefined, throw Error("GitHub owner not configured")
       d. If repo is empty or undefined, throw Error("GitHub repo not configured")

    3. Construct production URL:
       - Return `https://github.com/${owner}/${repo}/releases/latest/download/manifest.json`
       - NOTE: /latest/download/ path (NOT version-specific)

  Examples:
    Production mode:
      constructManifestUrl({ owner: "941design", repo: "slim-chat" }, undefined)
      → "https://github.com/941design/slim-chat/releases/latest/download/manifest.json"

    Dev mode with GitHub release:
      constructManifestUrl({}, "https://github.com/941design/slim-chat/releases/download/v1.0.0")
      → "https://github.com/941design/slim-chat/releases/download/v1.0.0/manifest.json"

    Dev mode with local file:
      constructManifestUrl({}, "file://./test-manifests/v1.0.0")
      → "file://./test-manifests/v1.0.0/manifest.json"

  Changes from current implementation:
    - REMOVED: version parameter
    - REMOVED: manifestUrl parameter and override logic
    - REMOVED: version tag handling (startsWith 'v')
    - CHANGED: Always uses /latest/download/ in production
    - ADDED: devUpdateSource parameter for dev mode
```

**Property-based testing requirements:**
- Property: Production URL always contains `/latest/download/`
- Property: Dev mode URL always ends with `/manifest.json`
- Property: Validation errors thrown when publishConfig incomplete (production)
- Property: Dev mode bypasses publishConfig validation

---

## File 4: src/main/config.ts

### Modification: normalizeConfig() function (lines 41-59)

**Current implementation:**
```typescript
function normalizeConfig(raw: any): AppConfig {
  const logLevel: LogLevel = ['debug', 'info', 'warn', 'error'].includes(raw?.logLevel)
    ? raw.logLevel
    : DEFAULT_CONFIG.logLevel;

  return {
    autoUpdate: typeof raw?.autoUpdate === 'boolean' ? raw.autoUpdate : DEFAULT_CONFIG.autoUpdate,
    logLevel,
    manifestUrl: typeof raw?.manifestUrl === 'string' ? raw.manifestUrl : undefined,  // <-- REMOVE
    autoUpdateBehavior: ['manual', 'auto-download'].includes(raw?.autoUpdateBehavior)
      ? raw.autoUpdateBehavior
      : undefined,
    logRetentionDays: typeof raw?.logRetentionDays === 'number' ? raw.logRetentionDays : undefined,
    logMaxFileSizeMB: typeof raw?.logMaxFileSizeMB === 'number' ? raw.logMaxFileSizeMB : undefined,
    forceDevUpdateConfig: typeof raw?.forceDevUpdateConfig === 'boolean' ? raw.forceDevUpdateConfig : undefined,
    devUpdateSource: typeof raw?.devUpdateSource === 'string' ? raw.devUpdateSource : undefined,
    allowPrerelease: typeof raw?.allowPrerelease === 'boolean' ? raw.allowPrerelease : undefined,
  };
}
```

**Required implementation:**
```typescript
function normalizeConfig(raw: any): AppConfig {
  const logLevel: LogLevel = ['debug', 'info', 'warn', 'error'].includes(raw?.logLevel)
    ? raw.logLevel
    : DEFAULT_CONFIG.logLevel;

  return {
    autoUpdate: typeof raw?.autoUpdate === 'boolean' ? raw.autoUpdate : DEFAULT_CONFIG.autoUpdate,
    logLevel,
    // manifestUrl removed - manifest URL now always derived from GitHub repo
    autoUpdateBehavior: ['manual', 'auto-download'].includes(raw?.autoUpdateBehavior)
      ? raw.autoUpdateBehavior
      : undefined,
    logRetentionDays: typeof raw?.logRetentionDays === 'number' ? raw.logRetentionDays : undefined,
    logMaxFileSizeMB: typeof raw?.logMaxFileSizeMB === 'number' ? raw.logMaxFileSizeMB : undefined,
    forceDevUpdateConfig: typeof raw?.forceDevUpdateConfig === 'boolean' ? raw.forceDevUpdateConfig : undefined,
    devUpdateSource: typeof raw?.devUpdateSource === 'string' ? raw.devUpdateSource : undefined,
    allowPrerelease: typeof raw?.allowPrerelease === 'boolean' ? raw.allowPrerelease : undefined,
  };
}
```

**Change:**
- Remove `manifestUrl` field from returned object
- Add comment explaining removal

**Backward compatibility:**
- Old config files with manifestUrl will load successfully (field simply ignored)
- No migration needed - silent graceful handling

**Testing requirement:**
- Property: Loading config with manifestUrl field ignores it (no error)
- Property: Saved config never contains manifestUrl

---

## File 5: src/main/ipc/handlers.ts

### Analysis: No changes required

**Verification:**
- `config:get` handler returns full AppConfig (with manifestUrl removed by type)
- `config:set` handler accepts Partial<AppConfig> (manifestUrl no longer valid field)
- No explicit manifestUrl exposure in handlers
- TypeScript will enforce manifestUrl removal through type system

**Testing requirement:**
- Verify config:get returns AppConfig without manifestUrl field
- Verify config:set rejects attempts to set manifestUrl (TypeScript compile error)

---

## Cross-Cutting Concerns

### Update Call Sites

**Files that call constructManifestUrl:**
1. `src/main/integration.ts` - verifyDownloadedUpdate function
2. Search for other callers

**Required changes:**
- Update all call sites to use new signature: `constructManifestUrl(publishConfig, devUpdateSource?)`
- Remove version parameter
- Remove manifestUrl parameter
- Pass devUpdateSource from config/devConfig where appropriate

---

## Testing Strategy

### Unit Tests to Update

1. **controller.test.ts**
   - Update tests for setupUpdater to verify GitHub provider in production
   - Add tests for GitHub provider configuration
   - Update tests that expect generic provider URL format
   - Verify dev mode still uses generic provider

2. **integration.test.ts**
   - Update constructManifestUrl tests for new signature
   - Remove version parameter from test cases
   - Add tests for `/latest/download/` path in production
   - Add tests for devUpdateSource parameter
   - Remove manifestUrl override tests

3. **config.test.ts**
   - Verify manifestUrl field ignored in normalizeConfig
   - Verify backward compatibility with old configs

### Property-Based Tests to Add

1. **Feed URL configuration properties:**
   - Property: Production always uses GitHub provider
   - Property: Dev mode with devUpdateSource uses generic provider
   - Property: Precedence maintained (env > config > default)

2. **Manifest URL construction properties:**
   - Property: Production URL independent of version
   - Property: Dev mode URL derived from devUpdateSource
   - Property: All URLs end with /manifest.json

3. **Config handling properties:**
   - Property: Config with manifestUrl loads without error
   - Property: Saved config never contains manifestUrl

---

## Implementation Order

**Sequential implementation required (changes are tightly coupled):**

1. Update AppConfig type (src/shared/types.ts)
2. Update config module (src/main/config.ts)
3. Update constructManifestUrl signature and implementation (src/main/integration.ts)
4. Update all call sites of constructManifestUrl
5. Update setupUpdater function (src/main/update/controller.ts)
6. Update unit tests
7. Verify IPC handlers (no code changes needed)

**Critical:** All changes must be tested together - intermediate states may not compile or run correctly.

---

## Success Criteria

1. ✓ TypeScript compilation succeeds with manifestUrl removed
2. ✓ Production mode uses GitHub provider
3. ✓ Dev mode with devUpdateSource uses generic provider
4. ✓ Manifest URL uses `/latest/download/` in production
5. ✓ Old configs with manifestUrl load successfully
6. ✓ All unit tests pass
7. ✓ Production safety constraints maintained (C1)
8. ✓ Dev mode flexibility preserved (C3)
9. ✓ Cross-version updates enabled

---

## Notes for Implementation

- This is a single atomic component - all files must be updated together
- Production safety is critical - verify isDevModeActive logic unchanged
- Backward compatibility is automatic - no migration needed
- Tests will need significant updates due to URL format changes
- Focus on property-based tests for configuration precedence and URL construction
