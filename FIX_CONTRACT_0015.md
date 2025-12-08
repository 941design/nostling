# Fix Contract: Update Signature Verification After Restart (Bug 0015)

**Bug Report**: bug-reports/0015-update-signature-verification-after-restart-report.md
**Reproduction Test**: src/main/update/bug-restart-signature-verification.test.ts
**Status**: AWAITING_FIX_IMPLEMENTATION

---

## ROOT CAUSE

When `autoInstallOnAppQuit=false`, calling `autoUpdater.quitAndInstall()` triggers MacUpdater to invoke `nativeUpdater.checkForUpdates()` (line 249 in MacUpdater.js). This causes Squirrel.Mac to:

1. Fetch the update.zip from the proxy server
2. Extract the zip file
3. Perform macOS code signature verification on the embedded app bundle
4. **FAIL**: App is ad-hoc signed (linker-signed), not signed with Apple Developer certificate
5. Emit error event: "signature verification failed"

**Key Insight**: The `identity: null` setting in package.json only affects electron-builder's BUILD-time signing behavior. It does NOT prevent Squirrel.Mac's INSTALL-time signature verification.

**Execution Path**:
```
restartToUpdate()
  → autoUpdater.quitAndInstall()
  → MacUpdater.quitAndInstall() [line 236]
  → Check squirrelDownloadedUpdate (false because autoInstallOnAppQuit=false)
  → Execute else branch [line 241-249]
  → nativeUpdater.checkForUpdates() [line 249]
  → Squirrel.Mac fetches + verifies + FAILS
  → nativeUpdater emits 'error' [MacUpdater.js:18-21]
  → Error propagated to index.ts:99-104
  → Sanitized to "Manifest signature verification failed"
```

---

## AFFECTED COMPONENTS

### Primary
- **File**: `src/main/update/controller.ts`
- **Function**: `setupUpdater()` (lines 109-176)
- **Setting**: `autoUpdater.autoInstallOnAppQuit = false` (line 115)

### Secondary
- **File**: `src/main/index.ts`
- **Function**: `restartToUpdate()` (lines 179-188)
- **Call**: `autoUpdater.quitAndInstall()` (line 186)

### External
- **Package**: `electron-updater@6.3.9`
- **Module**: `MacUpdater.js` (lines 236-249)
- **Native**: Squirrel.Mac framework (macOS code signature verification)

---

## IMPACT ANALYSIS

### Scope
- **Severity**: HIGH
- **Affected Users**: All macOS users attempting to update from any version
- **Affected Platform**: macOS only (darwin)
- **Affected Workflow**: Manual update installation via "Restart to Update" button

### Side Effects
- **Update mechanism**: Squirrel.Mac-based auto-update flow
- **User experience**: Update appears ready but fails on restart attempt
- **Security**: Custom RSA verification still passes (not weakened)
- **Compatibility**: Affects all future updates unless fixed

---

## FIX APPROACH

### Option 1: Set `autoInstallOnAppQuit = true` (RECOMMENDED)

**Change**: `src/main/update/controller.ts:115`
```typescript
// BEFORE
autoUpdater.autoInstallOnAppQuit = false;

// AFTER
autoUpdater.autoInstallOnAppQuit = true;
```

**Reason**:
- When `autoInstallOnAppQuit=true`, MacUpdater calls `nativeUpdater.checkForUpdates()` during the DOWNLOAD phase (line 219), not during quitAndInstall()
- This means Squirrel.Mac verification happens EARLY, and errors surface during download (not after restart click)
- If Squirrel verification fails, the update-downloaded event never fires, preventing "Restart to Update" from showing
- User never sees a failed update as "ready to install"

**Benefits**:
- ✅ Minimal code change (1 line)
- ✅ Squirrel verification happens early (fail-fast)
- ✅ No changes to security verification logic
- ✅ Preserves all existing verification steps
- ✅ Compatible with current electron-updater version

**Concerns**:
- ⚠️ May still fail if Squirrel.Mac signature verification cannot be disabled
- ⚠️ Changes timing: app may quit automatically after update installed
- ⚠️ Requires testing to confirm Squirrel accepts ad-hoc signed apps

**Testing Required**:
1. Build 0.0.16 with `autoInstallOnAppQuit=true`
2. Test update from 0.0.14 → 0.0.16 on macOS arm64
3. Verify Squirrel.Mac accepts ad-hoc signed app OR errors during download phase
4. If errors during download, document and proceed to Option 2

---

### Option 2: Disable Squirrel.Mac integration for ad-hoc signed apps

**Investigation Required**:
- Check if electron-updater has option to skip Squirrel.Mac for unsigned apps
- Review electron-updater changelog for macOS unsigned app support
- Consider using generic provider instead of GitHub provider on macOS

**Changes** (if feasible):
```typescript
// src/main/update/controller.ts
if (process.platform === 'darwin' && !isProperlyCodeSigned()) {
  // Use generic provider to bypass Squirrel.Mac
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download/`
  });
} else {
  // Use GitHub provider (enables Squirrel.Mac)
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO
  });
}
```

**Benefits**:
- ✅ Completely bypasses Squirrel.Mac for ad-hoc signed apps
- ✅ Preserves Squirrel.Mac for properly signed apps (if added later)

**Concerns**:
- ⚠️ Larger code change
- ⚠️ May lose differential download optimization
- ⚠️ Requires testing generic provider on macOS

---

### Option 3: Manual installation flow (NOT RECOMMENDED)

Extract and install update manually without Squirrel.Mac.

**Reason for Rejection**:
- ❌ Major refactoring required
- ❌ High risk of introducing new bugs
- ❌ Loses electron-updater's tested installation logic
- ❌ Out of scope for surgical bug fix

---

## CHANGES TO MAKE

### File: `src/main/update/controller.ts`

**Function**: `setupUpdater()` (line 115)

**Change**:
```typescript
// BUG FIX: Enable autoInstallOnAppQuit to trigger Squirrel verification during download
// Root cause: autoInstallOnAppQuit=false delays Squirrel verification until quitAndInstall()
// Bug report: bug-reports/0015-update-signature-verification-after-restart-report.md
// Fixed: 2025-12-08
autoUpdater.autoInstallOnAppQuit = true;
```

**Reason**: Moves Squirrel.Mac signature verification from quitAndInstall() to download phase, enabling early failure detection.

---

## INVARIANTS TO PRESERVE

### Security Verification
- ✅ Custom RSA signature verification MUST remain unchanged
- ✅ Manifest verification MUST pass before showing update as ready
- ✅ Version validation MUST remain unchanged
- ✅ Hash verification MUST remain unchanged
- ✅ No weakening of security checks

### API Contracts
- ✅ `autoUpdater.quitAndInstall()` signature unchanged
- ✅ `setupUpdater()` parameters unchanged
- ✅ IPC handlers unchanged
- ✅ Update state transitions unchanged (except timing)

### Existing Behavior
- ✅ Update checking flow unchanged
- ✅ Download progress reporting unchanged
- ✅ Error handling unchanged (except success/failure outcome)
- ✅ Configuration options unchanged

### Backward Compatibility
- ✅ Users on 0.0.13 can still update to fixed version
- ✅ Custom manifest.json format unchanged
- ✅ GitHub release asset structure unchanged

---

## VERIFICATION PLAN

### Before Fix (Reproduce Bug)
1. Run SlimChat 0.0.14 on macOS arm64
2. Manually trigger update check
3. Wait for update 0.0.15 to download
4. Verify all custom verification passes
5. Click "Restart to Update"
6. Confirm error: "Manifest signature verification failed"
7. Confirm app remains on 0.0.14

### After Fix (Verify Resolution)
1. Apply fix: Set `autoInstallOnAppQuit = true`
2. Build version 0.0.16 with fix
3. Run SlimChat 0.0.14 on macOS arm64
4. Trigger update check
5. **Expected outcome A**: Update downloads successfully and installs
6. **Expected outcome B**: Update fails during download (Squirrel verification early)
7. If outcome B: Proceed to Option 2 investigation
8. If outcome A: Verify app restarts with version 0.0.16

### Regression Testing
1. Run full test suite: `npm test`
2. Expected: All 378 tests pass (no new failures)
3. Run E2E tests: `npm run test:e2e`
4. Expected: Update flow tests pass
5. Manual test: Update from 0.0.15 → 0.0.16 (forward compatibility)
6. Manual test: Update from 0.0.13 → 0.0.16 (backward compatibility)

### Edge Cases
1. Test with slow network (verify download still completes)
2. Test with app quit before Squirrel verification completes
3. Test with multiple rapid "Restart to Update" clicks
4. Test with autoUpdate disabled in config

---

## CONSTRAINTS

### Must Preserve
- ❌ No refactoring of update system
- ❌ No changes to RSA verification logic
- ❌ No changes to manifest format
- ❌ No weakening of security
- ❌ No breaking changes to config schema

### Must Not Require
- ❌ Apple Developer certificate ($99/year)
- ❌ macOS notarization
- ❌ Code signing infrastructure changes
- ❌ CI/CD workflow changes (beyond version bump)

### Must Maintain
- ✅ Privacy-respecting defaults
- ✅ User control over updates
- ✅ Clear error messages
- ✅ Backward compatibility

---

## FIX PSEUDOCODE

```typescript
// src/main/update/controller.ts, line 109-176

export function setupUpdater(
  autoDownloadEnabled: boolean,
  config: AppConfig,
  devConfig: DevUpdateConfig
): void {
  autoUpdater.autoDownload = autoDownloadEnabled;

  // BUG FIX: Enable autoInstallOnAppQuit to trigger Squirrel verification during download
  // Root cause: autoInstallOnAppQuit=false delays Squirrel verification until quitAndInstall()
  //             causing signature verification to fail AFTER user clicks "Restart to Update"
  // Fix: autoInstallOnAppQuit=true triggers Squirrel verification during download phase
  //      - If Squirrel accepts ad-hoc signed app: installation proceeds
  //      - If Squirrel rejects ad-hoc signed app: error surfaces early (not after restart click)
  // Bug report: bug-reports/0015-update-signature-verification-after-restart-report.md
  // Fixed: 2025-12-08
  autoUpdater.autoInstallOnAppQuit = true;  // CHANGED FROM: false

  // ... rest of function unchanged
}
```

---

## ACCEPTANCE CRITERIA

### Must Fix
- ✅ Update from 0.0.14 → 0.0.16 succeeds on macOS arm64
- ✅ No error "Manifest signature verification failed" after restart click
- ✅ App successfully restarts with new version installed

### Must Not Break
- ✅ Custom RSA verification still passes
- ✅ All 378 existing tests pass
- ✅ E2E update tests pass
- ✅ Update from older versions (0.0.13) still works

### Must Document
- ✅ Code comment explaining fix at change location
- ✅ Bug report reference in code
- ✅ Regression test added (already exists: bug-restart-signature-verification.test.ts)
- ✅ CHANGELOG.md entry

---

## RISK ASSESSMENT

### Low Risk Changes
- ✅ Single line change (autoInstallOnAppQuit flag)
- ✅ Well-understood electron-updater behavior
- ✅ Preserves all security checks

### Medium Risk
- ⚠️ Changes timing of Squirrel.Mac verification
- ⚠️ May change app quit behavior (auto-quit after install)
- ⚠️ Requires macOS testing to confirm Squirrel accepts ad-hoc signed apps

### High Risk (Mitigated)
- ❌ No high-risk changes if Option 1 works
- ⚠️ If Option 1 fails, Option 2 becomes medium-risk (more code changes)

### Mitigation Strategies
1. Test thoroughly on macOS arm64 before release
2. Have rollback plan: revert to 0.0.14 if 0.0.16 fails
3. Monitor error logs in production for first 48 hours
4. Document fallback to manual installation if automated update fails

---

## OPEN QUESTIONS

1. **Does Squirrel.Mac accept ad-hoc signed apps when autoInstallOnAppQuit=true?**
   - Needs testing on macOS arm64
   - If NO: Proceed to Option 2 (generic provider investigation)
   - If YES: Fix is complete

2. **Will this change affect user experience?**
   - May cause app to quit automatically after update installed
   - Needs UX testing to confirm behavior is acceptable

3. **Are there electron-updater configuration options we're missing?**
   - Review electron-updater docs for macOS unsigned app support
   - Check if `autoUpdater.allowDowngrade` or other flags help

---

## NEXT STEPS

1. **Implement Option 1**: Set `autoInstallOnAppQuit = true`
2. **Test locally**: Build and test update 0.0.14 → 0.0.16 on macOS arm64
3. **Verify outcome**:
   - If update succeeds: Proceed to documentation and release
   - If update fails early: Investigate Option 2 (generic provider)
4. **Run regression tests**: Ensure no test failures
5. **Update documentation**: CHANGELOG.md, code comments
6. **Create PR**: For review and merge to dev branch

---

## RELATED BUGS

- **electron-updater-macos-signature-verification-report.md**: Previous macOS signing issue, fixed with `identity: null`
- **Relationship**: Same root cause (Squirrel.Mac signature verification), different trigger point
- **Key Difference**: Previous bug fixed BUILD-time signing; this bug addresses INSTALL-time verification timing

