/**
 * Property-based tests for getStatusTextThemed()
 *
 * Verifies:
 * - All UpdatePhase values handled correctly
 * - Dynamic content preservation (versions, progress, errors)
 * - Themed messages randomly selected
 * - Format consistency with original implementation
 * - Backward compatibility with getStatusText() patterns
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import { getStatusTextThemed } from './utils.themed';
import { getThemedMessagesConfig } from './themed-messages';
import type { UpdatePhase, UpdateState, DownloadProgress } from '../shared/types';

const allUpdatePhases: UpdatePhase[] = [
  'idle',
  'checking',
  'available',
  'downloading',
  'downloaded',
  'verifying',
  'ready',
  'mounting',
  'mounted',
  'failed',
];

describe('getStatusTextThemed - Property-Based Tests', () => {
  describe('Completeness: All UpdatePhase values handled', () => {
    it('returns non-empty string for all phases', () => {
      fc.assert(
        fc.property(fc.constantFrom(...allUpdatePhases), (phase) => {
          const updateState: UpdateState = { phase };
          const result = getStatusTextThemed(updateState);

          expect(result).toBeTruthy();
          expect(result.length).toBeGreaterThan(0);
        }),
      );
    });

    it('all phases have themed alternatives in configuration', () => {
      const config = getThemedMessagesConfig();

      allUpdatePhases.forEach((phase) => {
        const alternatives = config.updatePhases[phase];
        expect(alternatives).toBeDefined();
        expect(Array.isArray(alternatives)).toBe(true);
        expect(alternatives.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Variability: Themed messages randomly selected', () => {
    it('phases with multiple alternatives can return different messages', () => {
      const config = getThemedMessagesConfig();

      allUpdatePhases.forEach((phase) => {
        const alternatives = config.updatePhases[phase];

        if (alternatives.length > 1) {
          const results = new Set<string>();
          const maxAttempts = 100;

          for (let i = 0; i < maxAttempts; i++) {
            const updateState: UpdateState = { phase };
            const result = getStatusTextThemed(updateState);
            results.add(result);

            if (results.size > 1) break;
          }

          expect(results.size).toBeGreaterThan(1);
        }
      });
    });

    it('result always matches one of configured alternatives (base message)', () => {
      const config = getThemedMessagesConfig();

      fc.assert(
        fc.property(fc.constantFrom(...allUpdatePhases), (phase) => {
          const updateState: UpdateState = { phase };
          const result = getStatusTextThemed(updateState);
          const alternatives = config.updatePhases[phase];

          const startsWithAlternative = alternatives.some((alt) => result.startsWith(alt));
          expect(startsWithAlternative).toBe(true);
        }),
      );
    });
  });

  describe('Dynamic content: version preservation', () => {
    it('available phase includes version when provided', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 20 }), (version) => {
          const trimmed = version.trim();
          if (!trimmed) return;

          const updateState: UpdateState = { phase: 'available', version };
          const result = getStatusTextThemed(updateState);

          expect(result).toContain(`v${version}`);
        }),
      );
    });

    it('available phase omits version when empty or whitespace', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('', '   ', '\t', '\n'),
          (version) => {
            const updateState: UpdateState = { phase: 'available', version };
            const result = getStatusTextThemed(updateState);
            const config = getThemedMessagesConfig();
            const alternatives = config.updatePhases.available;

            const matchesAlternative = alternatives.some((alt) => result === alt);
            expect(matchesAlternative).toBe(true);
            expect(result).not.toContain(': v');
          },
        ),
      );
    });

    it('ready phase includes version when provided', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 20 }), (version) => {
          const trimmed = version.trim();
          if (!trimmed) return;

          const updateState: UpdateState = { phase: 'ready', version };
          const result = getStatusTextThemed(updateState);

          expect(result).toContain(`v${version}`);
        }),
      );
    });

    it('ready phase omits version when empty or whitespace', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('', '   ', '\t', '\n'),
          (version) => {
            const updateState: UpdateState = { phase: 'ready', version };
            const result = getStatusTextThemed(updateState);

            expect(result).not.toContain('v');
          },
        ),
      );
    });
  });

  describe('Dynamic content: progress preservation', () => {
    it('downloading phase includes all progress components', () => {
      fc.assert(
        fc.property(
          fc.record({
            percent: fc.double({ min: 0, max: 100 }),
            transferred: fc.integer({ min: 0, max: 1073741824 }),
            total: fc.integer({ min: 1, max: 1073741824 }),
            bytesPerSecond: fc.integer({ min: 0, max: 10485760 }),
          }),
          (progress) => {
            const updateState: UpdateState = { phase: 'downloading', progress };
            const result = getStatusTextThemed(updateState);

            expect(result).toContain('%');
            expect(result).toMatch(/\(/);
            expect(result).toMatch(/\//);
            expect(result).toMatch(/@/);
            expect(result).toContain('/s');

            const roundedPercent = Math.round(progress.percent);
            expect(result).toContain(`${roundedPercent}%`);
          },
        ),
      );
    });

    it('downloading phase without progress returns themed message only', () => {
      fc.assert(
        fc.property(fc.constantFrom(undefined, null), () => {
          const updateState: UpdateState = { phase: 'downloading', progress: undefined };
          const result = getStatusTextThemed(updateState);
          const config = getThemedMessagesConfig();
          const alternatives = config.updatePhases.downloading;

          const matchesAlternative = alternatives.some((alt) => result === alt);
          expect(matchesAlternative).toBe(true);
        }),
      );
    });

    it('mounting phase includes progress percent when provided', () => {
      fc.assert(
        fc.property(
          fc.record({
            percent: fc.double({ min: 0, max: 100 }),
            transferred: fc.integer({ min: 0, max: 1000000 }),
            total: fc.integer({ min: 1, max: 1000000 }),
            bytesPerSecond: fc.integer({ min: 0, max: 1000000 }),
          }),
          (progress) => {
            const updateState: UpdateState = { phase: 'mounting', progress };
            const result = getStatusTextThemed(updateState);

            const roundedPercent = Math.round(progress.percent);
            expect(result).toContain(`${roundedPercent}%`);
          },
        ),
      );
    });

    it('mounting phase without progress returns themed message only', () => {
      const updateState: UpdateState = { phase: 'mounting', progress: undefined };
      const result = getStatusTextThemed(updateState);
      const config = getThemedMessagesConfig();
      const alternatives = config.updatePhases.mounting;

      const matchesAlternative = alternatives.some((alt) => result === alt);
      expect(matchesAlternative).toBe(true);
    });

    it('progress percent always rounds to integer', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.1, max: 99.9 }),
          (percent) => {
            const progress: DownloadProgress = {
              percent,
              transferred: 1000,
              total: 2000,
              bytesPerSecond: 500,
            };

            const downloadingState: UpdateState = { phase: 'downloading', progress };
            const downloadingResult = getStatusTextThemed(downloadingState);

            const mountingState: UpdateState = { phase: 'mounting', progress };
            const mountingResult = getStatusTextThemed(mountingState);

            const roundedPercent = Math.round(percent);
            expect(downloadingResult).toContain(`${roundedPercent}%`);
            expect(mountingResult).toContain(`${roundedPercent}%`);
          },
        ),
      );
    });
  });

  describe('Dynamic content: error detail preservation', () => {
    it('failed phase includes detail when provided', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 200 }), (detail) => {
          const trimmed = detail.trim();
          if (!trimmed) return;

          const updateState: UpdateState = { phase: 'failed', detail };
          const result = getStatusTextThemed(updateState);

          expect(result).toContain(detail);
        }),
      );
    });

    it('failed phase omits detail when empty or whitespace', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('', '   ', '\t', '\n'),
          (detail) => {
            const updateState: UpdateState = { phase: 'failed', detail };
            const result = getStatusTextThemed(updateState);
            const config = getThemedMessagesConfig();
            const alternatives = config.updatePhases.failed;

            const matchesAlternative = alternatives.some((alt) => result === alt);
            expect(matchesAlternative).toBe(true);
          },
        ),
      );
    });

    it('failed phase preserves long error messages', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 100, maxLength: 500 }),
          (detail) => {
            const updateState: UpdateState = { phase: 'failed', detail };
            const result = getStatusTextThemed(updateState);

            expect(result).toContain(detail);
          },
        ),
      );
    });
  });

  describe('Format consistency: matches original patterns', () => {
    it('available with version uses colon separator pattern', () => {
      const updateState: UpdateState = { phase: 'available', version: '1.2.3' };
      const result = getStatusTextThemed(updateState);

      expect(result).toMatch(/.+: v1\.2\.3$/);
    });

    it('downloading with progress uses original format pattern', () => {
      const progress: DownloadProgress = {
        percent: 45.2,
        transferred: 131621519,
        total: 293601280,
        bytesPerSecond: 5452595,
      };
      const updateState: UpdateState = { phase: 'downloading', progress };
      const result = getStatusTextThemed(updateState);

      expect(result).toMatch(/.+: \d+% \(.+ \/ .+\) @ .+\/s$/);
    });

    it('mounting with progress uses space separator pattern', () => {
      const progress: DownloadProgress = {
        percent: 67,
        transferred: 1000,
        total: 1500,
        bytesPerSecond: 100,
      };
      const updateState: UpdateState = { phase: 'mounting', progress };
      const result = getStatusTextThemed(updateState);

      expect(result).toMatch(/.+ \d+%$/);
    });

    it('ready with version uses colon separator pattern', () => {
      const updateState: UpdateState = { phase: 'ready', version: '2.0.0' };
      const result = getStatusTextThemed(updateState);

      expect(result).toMatch(/.+: v2\.0\.0$/);
    });

    it('failed with detail uses colon separator pattern', () => {
      const updateState: UpdateState = { phase: 'failed', detail: 'Network timeout' };
      const result = getStatusTextThemed(updateState);

      expect(result).toMatch(/.+: Network timeout$/);
    });
  });

  describe('Phases without dynamic content', () => {
    it('idle returns themed message only', () => {
      const updateState: UpdateState = { phase: 'idle' };
      const result = getStatusTextThemed(updateState);
      const config = getThemedMessagesConfig();
      const alternatives = config.updatePhases.idle;

      const matchesAlternative = alternatives.some((alt) => result === alt);
      expect(matchesAlternative).toBe(true);
    });

    it('checking returns themed message only', () => {
      const updateState: UpdateState = { phase: 'checking' };
      const result = getStatusTextThemed(updateState);
      const config = getThemedMessagesConfig();
      const alternatives = config.updatePhases.checking;

      const matchesAlternative = alternatives.some((alt) => result === alt);
      expect(matchesAlternative).toBe(true);
    });

    it('downloaded returns themed message only', () => {
      const updateState: UpdateState = { phase: 'downloaded' };
      const result = getStatusTextThemed(updateState);
      const config = getThemedMessagesConfig();
      const alternatives = config.updatePhases.downloaded;

      const matchesAlternative = alternatives.some((alt) => result === alt);
      expect(matchesAlternative).toBe(true);
    });

    it('verifying returns themed message only', () => {
      const updateState: UpdateState = { phase: 'verifying' };
      const result = getStatusTextThemed(updateState);
      const config = getThemedMessagesConfig();
      const alternatives = config.updatePhases.verifying;

      const matchesAlternative = alternatives.some((alt) => result === alt);
      expect(matchesAlternative).toBe(true);
    });

    it('mounted returns themed message only', () => {
      const updateState: UpdateState = { phase: 'mounted' };
      const result = getStatusTextThemed(updateState);
      const config = getThemedMessagesConfig();
      const alternatives = config.updatePhases.mounted;

      const matchesAlternative = alternatives.some((alt) => result === alt);
      expect(matchesAlternative).toBe(true);
    });
  });

  describe('Edge cases and invariants', () => {
    it('result never empty for any phase combination', () => {
      fc.assert(
        fc.property(
          fc.record({
            phase: fc.constantFrom(...allUpdatePhases),
            version: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
            detail: fc.option(fc.string({ maxLength: 500 }), { nil: undefined }),
            progress: fc.option(
              fc.record({
                percent: fc.double({ min: 0, max: 100 }),
                transferred: fc.integer({ min: 0, max: 1073741824 }),
                total: fc.integer({ min: 1, max: 1073741824 }),
                bytesPerSecond: fc.integer({ min: 0, max: 10485760 }),
              }),
              { nil: undefined },
            ),
          }) as fc.Arbitrary<UpdateState>,
          (updateState) => {
            const result = getStatusTextThemed(updateState);

            expect(result).toBeTruthy();
            expect(result.length).toBeGreaterThan(0);
          },
        ),
      );
    });

    it('result length stays reasonable', () => {
      fc.assert(
        fc.property(
          fc.record({
            phase: fc.constantFrom(...allUpdatePhases),
            version: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
            detail: fc.option(fc.string({ maxLength: 500 }), { nil: undefined }),
            progress: fc.option(
              fc.record({
                percent: fc.double({ min: 0, max: 100 }),
                transferred: fc.integer({ min: 0, max: 1073741824 }),
                total: fc.integer({ min: 1, max: 1073741824 }),
                bytesPerSecond: fc.integer({ min: 0, max: 10485760 }),
              }),
              { nil: undefined },
            ),
          }) as fc.Arbitrary<UpdateState>,
          (updateState) => {
            const result = getStatusTextThemed(updateState);

            expect(result.length).toBeLessThan(1000);
          },
        ),
      );
    });

    it('undefined version handled same as empty', () => {
      const withUndefined: UpdateState = { phase: 'available', version: undefined };
      const withEmpty: UpdateState = { phase: 'available', version: '' };

      const result1 = getStatusTextThemed(withUndefined);
      const result2 = getStatusTextThemed(withEmpty);

      const config = getThemedMessagesConfig();
      const alternatives = config.updatePhases.available;

      expect(alternatives.some((alt) => result1 === alt)).toBe(true);
      expect(alternatives.some((alt) => result2 === alt)).toBe(true);
    });

    it('undefined detail handled same as empty', () => {
      const withUndefined: UpdateState = { phase: 'failed', detail: undefined };
      const withEmpty: UpdateState = { phase: 'failed', detail: '' };

      const result1 = getStatusTextThemed(withUndefined);
      const result2 = getStatusTextThemed(withEmpty);

      const config = getThemedMessagesConfig();
      const alternatives = config.updatePhases.failed;

      expect(alternatives.some((alt) => result1 === alt)).toBe(true);
      expect(alternatives.some((alt) => result2 === alt)).toBe(true);
    });

    it('special characters in version preserved', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
          (version) => {
            const updateState: UpdateState = { phase: 'available', version };
            const result = getStatusTextThemed(updateState);

            expect(result).toContain(version);
          },
        ),
      );
    });

    it('special characters in detail preserved', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0),
          (detail) => {
            const updateState: UpdateState = { phase: 'failed', detail };
            const result = getStatusTextThemed(updateState);

            expect(result).toContain(detail);
          },
        ),
      );
    });
  });

  describe('Backward compatibility: same dynamic content as original', () => {
    it('version prefix format matches original', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
          (version) => {
            const updateState: UpdateState = { phase: 'available', version };
            const result = getStatusTextThemed(updateState);

            expect(result).toContain(`v${version}`);
          },
        ),
      );
    });

    it('progress formatting matches original byte format', () => {
      fc.assert(
        fc.property(
          fc.record({
            percent: fc.double({ min: 0, max: 100 }),
            transferred: fc.integer({ min: 0, max: 1073741824 }),
            total: fc.integer({ min: 1, max: 1073741824 }),
            bytesPerSecond: fc.integer({ min: 0, max: 10485760 }),
          }),
          (progress) => {
            const updateState: UpdateState = { phase: 'downloading', progress };
            const result = getStatusTextThemed(updateState);

            expect(result).toMatch(/\d+(\.\d+)? (B|KB|MB|GB)/);
          },
        ),
      );
    });

    it('speed suffix always includes /s', () => {
      fc.assert(
        fc.property(
          fc.record({
            percent: fc.double({ min: 0, max: 100 }),
            transferred: fc.integer({ min: 0, max: 1000000 }),
            total: fc.integer({ min: 1, max: 1000000 }),
            bytesPerSecond: fc.integer({ min: 0, max: 1000000 }),
          }),
          (progress) => {
            const updateState: UpdateState = { phase: 'downloading', progress };
            const result = getStatusTextThemed(updateState);

            expect(result).toMatch(/@ .+\/s$/);
          },
        ),
      );
    });
  });

  describe('Example-based tests: specification examples', () => {
    it('idle example from specification', () => {
      const updateState: UpdateState = { phase: 'idle' };
      const result = getStatusTextThemed(updateState);
      const config = getThemedMessagesConfig();

      expect(config.updatePhases.idle).toContain(result);
    });

    it('available with version example from specification', () => {
      const updateState: UpdateState = { phase: 'available', version: '1.2.3' };
      const result = getStatusTextThemed(updateState);

      expect(result).toMatch(/.+: v1\.2\.3$/);
      expect(result.endsWith(': v1.2.3')).toBe(true);
    });

    it('downloading with progress example from specification', () => {
      const updateState: UpdateState = {
        phase: 'downloading',
        progress: {
          percent: 45.2,
          transferred: 131621519,
          total: 293601280,
          bytesPerSecond: 5452595,
        },
      };
      const result = getStatusTextThemed(updateState);

      expect(result).toContain('45%');
      expect(result).toContain('125.5 MB');
      expect(result).toMatch(/280\.\d MB/);
      expect(result).toContain('5.2 MB/s');
    });

    it('failed with detail example from specification', () => {
      const updateState: UpdateState = { phase: 'failed', detail: 'Network timeout' };
      const result = getStatusTextThemed(updateState);

      expect(result).toMatch(/.+: Network timeout$/);
    });
  });
});
