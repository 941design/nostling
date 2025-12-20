/**
 * Regression test: macOS code signing configuration
 *
 * Bug report: bug-reports/rejected-build-on-macos.md
 * Fixed: 2025-12-20
 * Root cause: CI builds unsigned macOS app without notarization, causing Gatekeeper rejection
 *
 * Protection: Ensures package.json configures hardened runtime and entitlements for proper signing
 *
 * NOTE: This test supersedes previous "identity: null" requirement. Modern macOS requires
 * proper Developer ID signing + notarization, not ad-hoc signing.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

describe('macOS Code Signing Configuration', () => {
  test('package.json build.mac must enable hardened runtime for notarization', () => {
    // Load package.json from project root
    const packageJsonPath = join(__dirname, '../../../package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

    // Verify electron-builder macOS configuration
    expect(packageJson.build).toBeDefined();
    expect(packageJson.build.mac).toBeDefined();
    expect(packageJson.build.mac.hardenedRuntime).toBe(true);
  });

  test('package.json build.mac must specify entitlements for Electron', () => {
    const packageJsonPath = join(__dirname, '../../../package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

    // CRITICAL: Entitlements required for Electron to run with hardened runtime
    expect(packageJson.build.mac.entitlements).toBe('build/entitlements.mac.plist');
    expect(packageJson.build.mac.entitlementsInherit).toBe('build/entitlements.mac.plist');
  });

  test('package.json build.mac must disable gatekeeper assessment during build', () => {
    const packageJsonPath = join(__dirname, '../../../package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

    // gatekeeperAssess: false prevents build-time validation (CI may not have credentials)
    expect(packageJson.build.mac.gatekeeperAssess).toBe(false);
  });
});
