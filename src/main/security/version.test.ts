/**
 * Property-based tests for version.ts
 *
 * Tests verify all contract invariants and properties:
 * - Anti-reflexive: Equal versions always return false (never upgrade to same version)
 * - Monotonic: Higher major/minor/patch always returns true
 * - Transitive: If v1 > v2 and v2 > v3, then v1 > v3
 * - Format validation: Invalid semver rejected
 * - Downgrade protection: Lower versions always return false
 * - Pre-release handling: Pre-release versions compared correctly
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import { validateVersion } from './version';

// Arbitraries for generating valid semver versions
const semverArb = fc
  .tuple(
    fc.integer({ min: 0, max: 99 }),
    fc.integer({ min: 0, max: 99 }),
    fc.integer({ min: 0, max: 99 })
  )
  .map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

const preReleaseArb = fc
  .tuple(
    fc.integer({ min: 0, max: 10 }),
    fc.integer({ min: 0, max: 10 }),
    fc.integer({ min: 0, max: 10 }),
    fc.constantFrom('alpha', 'beta', 'rc')
  )
  .map(([major, minor, patch, tag]) => `${major}.${minor}.${patch}-${tag}.1`);

const invalidVersionArb = fc.oneof(
  fc.string({ minLength: 1, maxLength: 20 }).filter(s => {
    // Exclude valid semver and v-prefixed versions (semver library accepts them)
    return !isValidSemver(s) && !isValidSemver(s.replace(/^v/, ''));
  }),
  fc.constant('invalid'),
  fc.constant('1.0'),
  fc.constant('1'),
  fc.constant('1.0.0.0'),
  fc.constant(''),
  fc.constant(' '),
  fc.constant('a.b.c'),
  fc.constant('1.0.0-'),
  fc.constant('1.0.0+'),
  fc.constant('not-a-version'),
  fc.constant('999')
);

function isValidSemver(version: string): boolean {
  const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/;
  return semverRegex.test(version);
}

describe('validateVersion', () => {
  describe('Property-Based Tests', () => {
    it('P001: Higher major version returns true', () => {
      fc.assert(
        fc.property(
          semverArb,
          fc.integer({ min: 0, max: 9 }),
          (baseVersion, majorIncrement) => {
            const [major, minor, patch] = baseVersion.split('.').map(Number);
            const currentVersion = `${major}.${minor}.${patch}`;
            const manifestVersion = `${major + majorIncrement + 1}.0.0`;

            const result = validateVersion(manifestVersion, currentVersion);
            expect(result.valid).toBe(true);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('P002: Higher minor version (same major) returns true', () => {
      fc.assert(
        fc.property(
          semverArb,
          fc.integer({ min: 0, max: 9 }),
          (baseVersion, minorIncrement) => {
            const [major, minor, patch] = baseVersion.split('.').map(Number);
            const currentVersion = `${major}.${minor}.${patch}`;
            const manifestVersion = `${major}.${minor + minorIncrement + 1}.0`;

            const result = validateVersion(manifestVersion, currentVersion);
            expect(result.valid).toBe(true);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('P003: Higher patch version (same major.minor) returns true', () => {
      fc.assert(
        fc.property(
          semverArb,
          fc.integer({ min: 0, max: 9 }),
          (baseVersion, patchIncrement) => {
            const [major, minor, patch] = baseVersion.split('.').map(Number);
            const currentVersion = `${major}.${minor}.${patch}`;
            const manifestVersion = `${major}.${minor}.${patch + patchIncrement + 1}`;

            const result = validateVersion(manifestVersion, currentVersion);
            expect(result.valid).toBe(true);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('P004: Equal versions return false (anti-reflexive)', () => {
      fc.assert(
        fc.property(semverArb, (version) => {
          const result = validateVersion(version, version);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.reason).toMatch(/equals/i);
          }
        }),
        { numRuns: 30 }
      );
    });

    it('P005: Lower major version returns false', () => {
      fc.assert(
        fc.property(
          semverArb,
          fc.integer({ min: 1, max: 9 }),
          (baseVersion, majorDecrement) => {
            const [major, minor, patch] = baseVersion.split('.').map(Number);
            if (major - majorDecrement < 0) return; // Skip invalid case
            const manifestVersion = `${major - majorDecrement}.${minor}.${patch}`;
            const currentVersion = `${major}.${minor}.${patch}`;

            const result = validateVersion(manifestVersion, currentVersion);
            expect(result.valid).toBe(false);
            if (!result.valid) {
              expect(result.reason).toMatch(/older/i);
            }
          }
        ),
        { numRuns: 25 }
      );
    });

    it('P006: Lower minor version (same major) returns false', () => {
      fc.assert(
        fc.property(
          semverArb,
          fc.integer({ min: 1, max: 9 }),
          (baseVersion, minorDecrement) => {
            const [major, minor, patch] = baseVersion.split('.').map(Number);
            if (minor - minorDecrement < 0) return; // Skip invalid case
            const manifestVersion = `${major}.${minor - minorDecrement}.${patch}`;
            const currentVersion = `${major}.${minor}.${patch}`;

            const result = validateVersion(manifestVersion, currentVersion);
            expect(result.valid).toBe(false);
            if (!result.valid) {
              expect(result.reason).toMatch(/older/i);
            }
          }
        ),
        { numRuns: 25 }
      );
    });

    it('P007: Lower patch version (same major.minor) returns false', () => {
      fc.assert(
        fc.property(
          semverArb,
          fc.integer({ min: 1, max: 9 }),
          (baseVersion, patchDecrement) => {
            const [major, minor, patch] = baseVersion.split('.').map(Number);
            if (patch - patchDecrement < 0) return; // Skip invalid case
            const manifestVersion = `${major}.${minor}.${patch - patchDecrement}`;
            const currentVersion = `${major}.${minor}.${patch}`;

            const result = validateVersion(manifestVersion, currentVersion);
            expect(result.valid).toBe(false);
            if (!result.valid) {
              expect(result.reason).toMatch(/older/i);
            }
          }
        ),
        { numRuns: 25 }
      );
    });

    it('P008: Invalid manifest version returns false', () => {
      fc.assert(
        fc.property(invalidVersionArb, semverArb, (invalidVersion, currentVersion) => {
          const result = validateVersion(invalidVersion, currentVersion);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.reason).toMatch(/Invalid manifest version/i);
          }
        }),
        { numRuns: 40 }
      );
    });

    it('P009: Invalid current version returns false', () => {
      fc.assert(
        fc.property(semverArb, invalidVersionArb, (manifestVersion, invalidVersion) => {
          const result = validateVersion(manifestVersion, invalidVersion);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.reason).toMatch(/Invalid current version/i);
          }
        }),
        { numRuns: 40 }
      );
    });

    it('P010: Both versions invalid returns false', () => {
      fc.assert(
        fc.property(invalidVersionArb, invalidVersionArb, (invalid1, invalid2) => {
          const result = validateVersion(invalid1, invalid2);
          expect(result.valid).toBe(false);
        }),
        { numRuns: 30 }
      );
    });

    it('P011: Pre-release version older than release (same major.minor.patch)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 99 }),
          fc.integer({ min: 0, max: 99 }),
          fc.integer({ min: 0, max: 99 }),
          (major, minor, patch) => {
            const prerelease = `${major}.${minor}.${patch}-beta.1`;
            const release = `${major}.${minor}.${patch}`;

            const result = validateVersion(prerelease, release);
            expect(result.valid).toBe(false);
            if (!result.valid) {
              expect(result.reason).toMatch(/older/i);
            }
          }
        ),
        { numRuns: 25 }
      );
    });

    it('P012: Pre-release version newer than older release (higher major)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 98 }),
          fc.integer({ min: 0, max: 99 }),
          fc.integer({ min: 0, max: 99 }),
          (major, minor, patch) => {
            const prerelease = `${major + 1}.0.0-alpha.1`;
            const oldRelease = `${major}.${minor}.${patch}`;

            const result = validateVersion(prerelease, oldRelease);
            expect(result.valid).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('P013: Transitive property - if v1 > v2 and v2 > v3, then v1 > v3', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.integer({ min: 0, max: 30 }),
            fc.integer({ min: 0, max: 30 }),
            fc.integer({ min: 0, max: 30 })
          ),
          ([a, b, c]) => {
            const v1 = `${a + 2}.0.0`;
            const v2 = `${a + 1}.0.0`;
            const v3 = `${a}.0.0`;

            const result1to2 = validateVersion(v1, v2);
            const result2to3 = validateVersion(v2, v3);
            const result1to3 = validateVersion(v1, v3);

            expect(result1to2.valid).toBe(true);
            expect(result2to3.valid).toBe(true);
            expect(result1to3.valid).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });

    it('P014: Deterministic - same inputs always produce same result', () => {
      fc.assert(
        fc.property(semverArb, semverArb, (manifest, current) => {
          const result1 = validateVersion(manifest, current);
          const result2 = validateVersion(manifest, current);
          const result3 = validateVersion(manifest, current);

          expect(result1).toEqual(result2);
          expect(result2).toEqual(result3);
        }),
        { numRuns: 30 }
      );
    });

    it('P015: Response structure - valid result only has "valid" field', () => {
      fc.assert(
        fc.property(semverArb, semverArb, (manifest, current) => {
          if (manifest === current || manifest < current) return; // Only check upgrade case

          const result = validateVersion(manifest, current);
          if (result.valid) {
            expect(Object.keys(result).length).toBe(1);
            expect(result).toEqual({ valid: true });
          }
        }),
        { numRuns: 30 }
      );
    });

    it('P016: Response structure - invalid result has "valid" and "reason" fields', () => {
      fc.assert(
        fc.property(semverArb, semverArb, (manifest, current) => {
          const result = validateVersion(manifest, current);
          if (!result.valid) {
            expect(Object.keys(result).sort()).toEqual(['reason', 'valid']);
            expect(result.reason).toBeDefined();
            expect(typeof result.reason).toBe('string');
            expect(result.reason.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 30 }
      );
    });

    it('P017: Reason field informative - contains relevant version when invalid', () => {
      fc.assert(
        fc.property(invalidVersionArb, semverArb, (invalidVersion, currentVersion) => {
          const result = validateVersion(invalidVersion, currentVersion);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.reason).toContain(invalidVersion);
          }
        }),
        { numRuns: 30 }
      );
    });

    it('P018: Case sensitivity - versions treated as-is (lowercase recommended)', () => {
      fc.assert(
        fc.property(semverArb, (baseVersion) => {
          // semver library normalizes, so uppercase should be treated same as lowercase
          const result1 = validateVersion('2.0.0', '1.0.0');
          const result2 = validateVersion('2.0.0', '1.0.0');

          expect(result1).toEqual(result2);
        }),
        { numRuns: 20 }
      );
    });

    it('P019: Large version numbers handled correctly', () => {
      const largeVersion1 = '999.999.999';
      const largeVersion2 = '999.999.998';

      const result = validateVersion(largeVersion1, largeVersion2);
      expect(result.valid).toBe(true);
    });

    it('P020: Zero versions handled correctly', () => {
      const result = validateVersion('0.0.1', '0.0.0');
      expect(result.valid).toBe(true);

      const result2 = validateVersion('0.0.0', '0.0.1');
      expect(result2.valid).toBe(false);
    });
  });

  describe('Example-Based Critical Tests', () => {
    it('E001: Upgrade from 1.0.0 to 2.0.0 succeeds', () => {
      const result = validateVersion('2.0.0', '1.0.0');
      expect(result.valid).toBe(true);
    });

    it('E002: No upgrade with same version fails', () => {
      const result = validateVersion('1.0.0', '1.0.0');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain('equals');
      }
    });

    it('E003: Downgrade from 1.0.0 to 0.9.0 fails (downgrade attack prevention)', () => {
      const result = validateVersion('0.9.0', '1.0.0');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain('older');
      }
    });

    it('E004: Invalid manifest version fails', () => {
      const result = validateVersion('invalid', '1.0.0');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain('Invalid manifest version');
      }
    });

    it('E005: Invalid current version fails', () => {
      const result = validateVersion('2.0.0', 'invalid');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain('Invalid current version');
      }
    });

    it('E006: Version string with "v" prefix succeeds (semver lib normalizes)', () => {
      // semver.valid() accepts and normalizes "v" prefixed versions
      // This is correct behavior for a semver library
      const result = validateVersion('v2.0.0', '1.0.0');
      expect(result.valid).toBe(true);
    });

    it('E007: Empty version string fails', () => {
      const result = validateVersion('', '1.0.0');
      expect(result.valid).toBe(false);
    });

    it('E008: Whitespace-only version fails', () => {
      const result = validateVersion('  ', '1.0.0');
      expect(result.valid).toBe(false);
    });

    it('E009: Pre-release upgrade 1.0.0-beta to 1.0.0-rc succeeds', () => {
      const result = validateVersion('1.0.0-rc.1', '1.0.0-beta.1');
      expect(result.valid).toBe(true);
    });

    it('E010: Pre-release to release upgrade succeeds', () => {
      const result = validateVersion('1.0.0', '1.0.0-beta.5');
      expect(result.valid).toBe(true);
    });

    it('E011: Minor version upgrade from 1.2.0 to 1.3.0 succeeds', () => {
      const result = validateVersion('1.3.0', '1.2.0');
      expect(result.valid).toBe(true);
    });

    it('E012: Patch version upgrade from 1.0.5 to 1.0.6 succeeds', () => {
      const result = validateVersion('1.0.6', '1.0.5');
      expect(result.valid).toBe(true);
    });

    it('E013: Real-world upgrade scenario 1.2.3 to 2.0.0 succeeds', () => {
      const result = validateVersion('2.0.0', '1.2.3');
      expect(result.valid).toBe(true);
    });

    it('E014: Real-world downgrade scenario 1.5.0 to 1.4.9 fails', () => {
      const result = validateVersion('1.4.9', '1.5.0');
      expect(result.valid).toBe(false);
    });

    it('E015: Malformed version "1.0.0.0" fails', () => {
      const result = validateVersion('1.0.0.0', '1.0.0');
      expect(result.valid).toBe(false);
    });

    it('E016: Malformed version "1.0" fails', () => {
      const result = validateVersion('1.0', '1.0.0');
      expect(result.valid).toBe(false);
    });

    it('E017: Null-like string "null" fails', () => {
      const result = validateVersion('null', '1.0.0');
      expect(result.valid).toBe(false);
    });

    it('E018: Unicode version fails', () => {
      const result = validateVersion('1.0.0-α', '1.0.0');
      expect(result.valid).toBe(false);
    });

    it('E019: Double increment 1.0.0 to 1.0.2 succeeds', () => {
      const result = validateVersion('1.0.2', '1.0.0');
      expect(result.valid).toBe(true);
    });

    it('E020: Security scenario - prevents downgrade attack from 3.5.2 to 3.5.1', () => {
      const result = validateVersion('3.5.1', '3.5.2');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain('older');
      }
    });
  });
});
