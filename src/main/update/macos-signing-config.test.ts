/**
 * Regression test: macOS code signing configuration
 *
 * Bug report: bug-reports/macos-gatekeeper-warning-unsigned-app.md
 * Fixed: 2025-12-08
 * Root cause: electron-builder was signing with ad-hoc signatures, triggering Gatekeeper warnings
 *
 * Protection: Ensures package.json always specifies identity: null to prevent ad-hoc signing
 */

import { readFileSync } from 'fs';
import { join } from 'path';

describe('macOS Code Signing Configuration', () => {
  test('package.json build.mac.identity must be null to prevent Gatekeeper warnings', () => {
    // Load package.json from project root
    const packageJsonPath = join(__dirname, '../../../package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

    // Verify electron-builder macOS configuration
    expect(packageJson.build).toBeDefined();
    expect(packageJson.build.mac).toBeDefined();
    expect(packageJson.build.mac.identity).toBe(null);
  });

  test('package.json build.mac.identity must be explicitly null (not undefined)', () => {
    const packageJsonPath = join(__dirname, '../../../package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

    // CRITICAL: Must be null, not undefined
    // undefined allows electron-builder to use default ad-hoc signing
    // null explicitly disables code signing
    expect(packageJson.build.mac.identity).not.toBeUndefined();
    expect(packageJson.build.mac.identity).toBeNull();
  });
});
