/**
 * Property-based tests for controller.ts
 *
 * Tests verify all contract invariants and properties:
 * - Unit selection: Correct unit used based on magnitude
 * - Precision: Proper decimal places (0 for B, 1 for KB/MB, 2 for GB per contract examples)
 * - Boundary handling: Correct unit at boundary values (1023/1024, etc)
 * - Edge cases: Negative numbers, floats, zero handled gracefully
 * - Monotonic property: Larger bytes produce larger numeric values
 * - Format consistency: All output strings match expected pattern
 * - Round-trip accuracy: Consistent formatting for same input
 */

import { describe, it, expect, jest, beforeAll } from '@jest/globals';
import fc from 'fast-check';

jest.mock('../logging', () => ({
  log: jest.fn(),
}));

import { formatBytes } from './controller';

describe('formatBytes', () => {
  describe('Property-Based Tests', () => {
    it('P001: Bytes in range [0, 1023] formatted with B unit', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1023 }), (bytes) => {
          const result = formatBytes(bytes);
          expect(result).toMatch(/^\d+ B$/);
          const numPart = parseInt(result.split(' ')[0], 10);
          expect(numPart).toBe(bytes);
        }),
        { numRuns: 100 }
      );
    });

    it('P002: Bytes in range [1024, 1048575] formatted with KB unit', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1024, max: 1048575 }), (bytes) => {
          const result = formatBytes(bytes);
          expect(result).toMatch(/^\d+(\.\d)? KB$/);
          const numPart = parseFloat(result.split(' ')[0]);
          expect(numPart).toBeGreaterThanOrEqual(1);
          expect(numPart).toBeLessThanOrEqual(1024);
        }),
        { numRuns: 100 }
      );
    });

    it('P003: Bytes in range [1048576, 1073741823] formatted with MB unit', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1048576, max: 1073741823 }), (bytes) => {
          const result = formatBytes(bytes);
          expect(result).toMatch(/^\d+(\.\d)? MB$/);
          const numPart = parseFloat(result.split(' ')[0]);
          expect(numPart).toBeGreaterThanOrEqual(1);
          expect(numPart).toBeLessThanOrEqual(1024);
        }),
        { numRuns: 100 }
      );
    });

    it('P004: Bytes >= 1073741824 formatted with GB unit', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1073741824, max: 10 * 1024 * 1024 * 1024 }), (bytes) => {
          const result = formatBytes(bytes);
          expect(result).toMatch(/^\d+\.\d{2} GB$/);
          const numPart = parseFloat(result.split(' ')[0]);
          expect(numPart).toBeGreaterThanOrEqual(1);
        }),
        { numRuns: 100 }
      );
    });

    it('P005: Decimal precision exactly 1 place for KB', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1024, max: 1048575 }), (bytes) => {
          const result = formatBytes(bytes);
          const numPart = result.split(' ')[0];
          const decimalPart = numPart.split('.')[1];
          expect(decimalPart).toHaveLength(1);
          expect(parseInt(decimalPart, 10)).toBeGreaterThanOrEqual(0);
          expect(parseInt(decimalPart, 10)).toBeLessThanOrEqual(9);
        }),
        { numRuns: 100 }
      );
    });

    it('P006: Decimal precision exactly 1 place for MB', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1048576, max: 1073741823 }), (bytes) => {
          const result = formatBytes(bytes);
          const numPart = result.split(' ')[0];
          const decimalPart = numPart.split('.')[1];
          expect(decimalPart).toHaveLength(1);
          expect(parseInt(decimalPart, 10)).toBeGreaterThanOrEqual(0);
          expect(parseInt(decimalPart, 10)).toBeLessThanOrEqual(9);
        }),
        { numRuns: 100 }
      );
    });

    it('P007: Decimal precision exactly 2 places for GB', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1073741824, max: 10 * 1024 * 1024 * 1024 }), (bytes) => {
          const result = formatBytes(bytes);
          const numPart = result.split(' ')[0];
          const decimalPart = numPart.split('.')[1];
          expect(decimalPart).toHaveLength(2);
          expect(parseInt(decimalPart, 10)).toBeGreaterThanOrEqual(0);
          expect(parseInt(decimalPart, 10)).toBeLessThanOrEqual(99);
        }),
        { numRuns: 100 }
      );
    });

    it('P008: Negative numbers handled as zero', () => {
      fc.assert(
        fc.property(fc.integer({ min: -1000000, max: -1 }), (bytes) => {
          const result = formatBytes(bytes);
          expect(result).toBe('0 B');
        }),
        { numRuns: 50 }
      );
    });

    it('P009: Non-integer inputs rounded down (floor)', () => {
      fc.assert(
        fc.property(
          fc.tuple(fc.integer({ min: 0, max: 100000 }), fc.integer({ min: 1, max: 999 })),
          ([whole, frac]) => {
            const floatValue = whole + frac / 1000;
            const result = formatBytes(floatValue);
            const resultFloor = formatBytes(Math.floor(floatValue));
            expect(result).toBe(resultFloor);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('P010: Monotonic property - larger bytes produce larger numeric values (when same unit)', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.integer({ min: 0, max: 500 }),
            fc.integer({ min: 1, max: 100 })
          ),
          ([base, increment]) => {
            const bytes1 = base;
            const bytes2 = base + increment;

            const result1 = formatBytes(bytes1);
            const result2 = formatBytes(bytes2);

            // Extract unit and numeric value
            const [num1Str, unit1] = result1.split(' ');
            const [num2Str, unit2] = result2.split(' ');
            const num1 = parseFloat(num1Str);
            const num2 = parseFloat(num2Str);

            // When same unit, larger bytes should give larger value
            if (unit1 === unit2) {
              expect(num2).toBeGreaterThanOrEqual(num1);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('P011: Deterministic - same input always produces same output', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 10 * 1024 * 1024 * 1024 }), (bytes) => {
          const result1 = formatBytes(bytes);
          const result2 = formatBytes(bytes);
          const result3 = formatBytes(bytes);
          expect(result1).toBe(result2);
          expect(result2).toBe(result3);
        }),
        { numRuns: 100 }
      );
    });

    it('P012: Output format correct - contains unit and numeric value', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 10 * 1024 * 1024 * 1024 }), (bytes) => {
          const result = formatBytes(bytes);
          expect(result).toMatch(/^\d+(\.\d+)?\s(B|KB|MB|GB)$/);
          const parts = result.split(' ');
          expect(parts).toHaveLength(2);
          const num = parseFloat(parts[0]);
          expect(Number.isFinite(num)).toBe(true);
          expect(['B', 'KB', 'MB', 'GB']).toContain(parts[1]);
        }),
        { numRuns: 100 }
      );
    });

    it('P013: KB unit never has leading zero for numeric value >= 1', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1024, max: 1048575 }), (bytes) => {
          const result = formatBytes(bytes);
          if (result.includes('KB')) {
            const num = parseFloat(result.split(' ')[0]);
            expect(num).toBeGreaterThanOrEqual(1);
            expect(num).toBeLessThanOrEqual(1024);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('P014: MB unit never has leading zero for numeric value >= 1', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1048576, max: 1073741823 }), (bytes) => {
          const result = formatBytes(bytes);
          if (result.includes('MB')) {
            const num = parseFloat(result.split(' ')[0]);
            expect(num).toBeGreaterThanOrEqual(1);
            expect(num).toBeLessThanOrEqual(1024);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('P015: GB unit never has leading zero for numeric value >= 1', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1073741824, max: 10 * 1024 * 1024 * 1024 }), (bytes) => {
          const result = formatBytes(bytes);
          if (result.includes('GB')) {
            const num = parseFloat(result.split(' ')[0]);
            expect(num).toBeGreaterThanOrEqual(1);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('P016: Boundary between B and KB is correct at 1023/1024', () => {
      fc.assert(
        fc.property(fc.constant(1023), (bytes) => {
          const result1023 = formatBytes(1023);
          const result1024 = formatBytes(1024);

          expect(result1023).toBe('1023 B');
          expect(result1024).toMatch(/^1\.0 KB$/);
        })
      );
    });

    it('P017: Boundary between KB and MB is correct at 1048575/1048576', () => {
      fc.assert(
        fc.property(fc.constant(1048575), (bytes) => {
          const resultMax = formatBytes(1048575);
          const resultMin = formatBytes(1048576);

          expect(resultMax).toMatch(/^1024\.0 KB$/);
          expect(resultMin).toMatch(/^1\.0 MB$/);
        })
      );
    });

    it('P018: Boundary between MB and GB is correct at 1073741823/1073741824', () => {
      fc.assert(
        fc.property(fc.constant(1073741823), (bytes) => {
          const resultMax = formatBytes(1073741823);
          const resultMin = formatBytes(1073741824);

          expect(resultMax).toMatch(/^1024\.0 MB$/);
          expect(resultMin).toMatch(/^1\.00 GB$/);
        })
      );
    });

    it('P019: Zero bytes formatted correctly', () => {
      const result = formatBytes(0);
      expect(result).toBe('0 B');
    });

    it('P020: No NaN or Infinity in output', () => {
      fc.assert(
        fc.property(fc.integer({ min: -1000000, max: 10 * 1024 * 1024 * 1024 }), (bytes) => {
          const result = formatBytes(bytes);
          expect(result).not.toContain('NaN');
          expect(result).not.toContain('Infinity');
          const numPart = parseFloat(result.split(' ')[0]);
          expect(Number.isFinite(numPart)).toBe(true);
          expect(numPart).toBeGreaterThanOrEqual(0);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Example-Based Critical Tests', () => {
    it('E001: Zero bytes returns "0 B"', () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    it('E002: 512 bytes returns "512 B"', () => {
      expect(formatBytes(512)).toBe('512 B');
    });

    it('E003: 1023 bytes returns "1023 B" (boundary)', () => {
      expect(formatBytes(1023)).toBe('1023 B');
    });

    it('E004: 1024 bytes returns "1.0 KB" (boundary)', () => {
      expect(formatBytes(1024)).toBe('1.0 KB');
    });

    it('E005: 1536 bytes returns "1.5 KB"', () => {
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    it('E006: 1048576 bytes returns "1.0 MB" (1 MiB)', () => {
      expect(formatBytes(1048576)).toBe('1.0 MB');
    });

    it('E007: 2097152 bytes returns "2.0 MB" (2 MiB)', () => {
      expect(formatBytes(2097152)).toBe('2.0 MB');
    });

    it('E008: 1073741824 bytes returns "1.00 GB" (1 GiB)', () => {
      expect(formatBytes(1073741824)).toBe('1.00 GB');
    });

    it('E009: 5368709120 bytes returns "5.00 GB" (5 GiB)', () => {
      expect(formatBytes(5368709120)).toBe('5.00 GB');
    });

    it('E010: 10737418240 bytes returns "10.00 GB" (10 GiB)', () => {
      expect(formatBytes(10737418240)).toBe('10.00 GB');
    });

    it('E011: Negative numbers treated as zero', () => {
      expect(formatBytes(-1)).toBe('0 B');
      expect(formatBytes(-1000)).toBe('0 B');
      expect(formatBytes(-1048576)).toBe('0 B');
    });

    it('E012: Float input 1536.7 rounds down to 1536 bytes', () => {
      expect(formatBytes(1536.7)).toBe('1.5 KB');
    });

    it('E013: Float input 1023.9 rounds down to 1023 bytes', () => {
      expect(formatBytes(1023.9)).toBe('1023 B');
    });

    it('E014: Very large GB values formatted correctly', () => {
      const result = formatBytes(1099511627776); // 1 TiB
      expect(result).toMatch(/^\d+\.\d{2} GB$/);
      expect(parseFloat(result.split(' ')[0])).toBeGreaterThan(1000);
    });

    it('E015: 512 MB boundary case', () => {
      const bytes = 512 * 1024 * 1024;
      const result = formatBytes(bytes);
      expect(result).toBe('512.0 MB');
    });

    it('E016: 512 KB boundary case', () => {
      const bytes = 512 * 1024;
      const result = formatBytes(bytes);
      expect(result).toBe('512.0 KB');
    });

    it('E017: 1.5 GB formatted with 2 decimal places', () => {
      const bytes = Math.floor(1.5 * 1024 * 1024 * 1024);
      const result = formatBytes(bytes);
      expect(result).toMatch(/^1\.5\d GB$/);
      const [numPart] = result.split(' ');
      const decimalPart = numPart.split('.')[1];
      expect(decimalPart).toHaveLength(2);
    });

    it('E018: Very small KB value near 1.0', () => {
      const bytes = 1024 + 50; // 1.048... KB
      const result = formatBytes(bytes);
      expect(result).toBe('1.0 KB');
    });

    it('E019: KB value approaching max before MB', () => {
      const bytes = 1048575; // Just before 1 MB
      const result = formatBytes(bytes);
      expect(result).toBe('1024.0 KB');
    });

    it('E020: Negative float rounds toward zero', () => {
      expect(formatBytes(-1.5)).toBe('0 B');
      expect(formatBytes(-512.9)).toBe('0 B');
    });
  });
});

describe('setupUpdater', () => {
  let mockAutoUpdater: any;
  let mockApp: any;
  let mockLog: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    mockAutoUpdater = {
      autoDownload: false,
      autoInstallOnAppQuit: false,
      forceDevUpdateConfig: false,
      allowPrerelease: false,
      setFeedURL: jest.fn(),
    };
    mockApp = {
      getVersion: jest.fn(() => '1.0.0'),
    };
    mockLog = jest.fn();

    jest.mock('electron-updater', () => ({
      autoUpdater: mockAutoUpdater,
    }));
    jest.mock('electron', () => ({
      app: mockApp,
    }));
    jest.mock('../logging', () => ({
      log: mockLog,
    }));
  });

  afterEach(() => {
    jest.unmock('electron-updater');
    jest.unmock('electron');
    jest.unmock('../logging');
  });

  describe('Property-Based Tests', () => {
    it('P001: Precedence property - devConfig values override config values, production safety enforced', () => {
      fc.assert(
        fc.property(
          fc.record({
            devForceDevUpdateConfig: fc.boolean(),
            devDevUpdateSource: fc.option(fc.webUrl(), { nil: undefined }),
            devAllowPrerelease: fc.boolean(),
            configForceDevUpdateConfig: fc.boolean(),
            configDevUpdateSource: fc.option(fc.webUrl(), { nil: undefined }),
            configAllowPrerelease: fc.boolean(),
          }),
          ({ devForceDevUpdateConfig, devDevUpdateSource, devAllowPrerelease, configForceDevUpdateConfig, configDevUpdateSource, configAllowPrerelease }) => {
            const { setupUpdater } = require('./controller');

            const devConfig = {
              forceDevUpdateConfig: devForceDevUpdateConfig,
              devUpdateSource: devDevUpdateSource,
              allowPrerelease: devAllowPrerelease,
            };

            const config = {
              autoUpdate: true,
              logLevel: 'info' as const,
              forceDevUpdateConfig: configForceDevUpdateConfig,
              devUpdateSource: configDevUpdateSource,
              allowPrerelease: configAllowPrerelease,
            };

            setupUpdater(true, config, devConfig);

            // Production safety (C1): config values ONLY used when devConfig indicates dev mode
            const isDevModeActive = devForceDevUpdateConfig || Boolean(devDevUpdateSource) || devAllowPrerelease;
            const expectedForce = devForceDevUpdateConfig || (isDevModeActive && configForceDevUpdateConfig);
            const expectedSource = devDevUpdateSource || (isDevModeActive && configDevUpdateSource);
            const expectedPrerelease = devAllowPrerelease || (isDevModeActive && configAllowPrerelease);

            expect(mockAutoUpdater.forceDevUpdateConfig).toBe(expectedForce);
            expect(mockAutoUpdater.allowPrerelease).toBe(expectedPrerelease);

            if (expectedSource) {
              expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith({
                provider: 'generic',
                url: expectedSource,
              });
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('P002: Production safety (C1) - when devConfig indicates production, config values MUST NOT enable dev features', () => {
      fc.assert(
        fc.property(
          fc.record({
            configForceDevUpdateConfig: fc.boolean(),
            configAllowPrerelease: fc.boolean(),
          }),
          ({ configForceDevUpdateConfig, configAllowPrerelease }) => {
            const { setupUpdater } = require('./controller');

            const devConfig = {
              forceDevUpdateConfig: false,
              devUpdateSource: undefined,
              allowPrerelease: false,
            };

            const config = {
              autoUpdate: true,
              logLevel: 'info' as const,
              forceDevUpdateConfig: configForceDevUpdateConfig,
              allowPrerelease: configAllowPrerelease,
            };

            setupUpdater(true, config, devConfig);

            // CRITICAL: When devConfig indicates production (all false), config.json MUST NOT leak dev features
            expect(mockAutoUpdater.forceDevUpdateConfig).toBe(false);
            expect(mockAutoUpdater.allowPrerelease).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('P003: URL determination follows precedence - devUpdateSource > manifestUrl > default', () => {
      fc.assert(
        fc.property(
          fc.record({
            devUpdateSource: fc.option(fc.webUrl(), { nil: undefined }),
            manifestUrl: fc.option(fc.webUrl().map(url => url + '/manifest.json'), { nil: undefined }),
          }),
          ({ devUpdateSource, manifestUrl }) => {
            const { setupUpdater } = require('./controller');

            const devConfig = {
              forceDevUpdateConfig: false,
              devUpdateSource,
              allowPrerelease: false,
            };

            const config = {
              autoUpdate: true,
              logLevel: 'info' as const,
              manifestUrl,
            };

            setupUpdater(true, config, devConfig);

            let expectedUrl: string;
            if (devUpdateSource) {
              expectedUrl = devUpdateSource;
            } else if (manifestUrl) {
              expectedUrl = manifestUrl.replace(/\/manifest\.json$/, '');
            } else {
              expectedUrl = 'https://github.com/941design/slim-chat/releases/download/v1.0.0';
            }

            expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith({
              provider: 'generic',
              url: expectedUrl,
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('P004: Backward compatibility - no dev config means default behavior', () => {
      fc.assert(
        fc.property(
          fc.record({
            manifestUrl: fc.option(fc.webUrl().map(url => url + '/manifest.json'), { nil: undefined }),
            autoDownload: fc.boolean(),
          }),
          ({ manifestUrl, autoDownload }) => {
            const { setupUpdater } = require('./controller');

            const devConfig = {
              forceDevUpdateConfig: false,
              devUpdateSource: undefined,
              allowPrerelease: false,
            };

            const config = {
              autoUpdate: true,
              logLevel: 'info' as const,
              manifestUrl,
            };

            setupUpdater(autoDownload, config, devConfig);

            expect(mockAutoUpdater.forceDevUpdateConfig).toBe(false);
            expect(mockAutoUpdater.allowPrerelease).toBe(false);
            expect(mockAutoUpdater.autoDownload).toBe(autoDownload);
            expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(false);

            let expectedUrl: string;
            if (manifestUrl) {
              expectedUrl = manifestUrl.replace(/\/manifest\.json$/, '');
            } else {
              expectedUrl = 'https://github.com/941design/slim-chat/releases/download/v1.0.0';
            }

            expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith({
              provider: 'generic',
              url: expectedUrl,
            });
          }
        ),
        { numRuns: 50 }
      );
    });

    it('P005: autoDownload setting preserved correctly', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          (autoDownload) => {
            const { setupUpdater } = require('./controller');

            const devConfig = {
              forceDevUpdateConfig: false,
              devUpdateSource: undefined,
              allowPrerelease: false,
            };

            const config = {
              autoUpdate: true,
              logLevel: 'info' as const,
            };

            setupUpdater(autoDownload, config, devConfig);

            expect(mockAutoUpdater.autoDownload).toBe(autoDownload);
            expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(false);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('P006: manifestUrl suffix removal correct', () => {
      fc.assert(
        fc.property(
          fc.webUrl(),
          (baseUrl) => {
            const { setupUpdater } = require('./controller');

            const devConfig = {
              forceDevUpdateConfig: false,
              devUpdateSource: undefined,
              allowPrerelease: false,
            };

            const config = {
              autoUpdate: true,
              logLevel: 'info' as const,
              manifestUrl: baseUrl + '/manifest.json',
            };

            setupUpdater(true, config, devConfig);

            expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith({
              provider: 'generic',
              url: baseUrl,
            });
          }
        ),
        { numRuns: 50 }
      );
    });

    it('P007: Logging occurs when forceDevUpdateConfig enabled', () => {
      fc.assert(
        fc.property(
          fc.boolean().filter(b => b === true),
          (forceEnabled) => {
            const { setupUpdater } = require('./controller');
            mockLog.mockClear();

            const devConfig = {
              forceDevUpdateConfig: forceEnabled,
              devUpdateSource: undefined,
              allowPrerelease: false,
            };

            const config = {
              autoUpdate: true,
              logLevel: 'info' as const,
            };

            setupUpdater(true, config, devConfig);

            expect(mockLog).toHaveBeenCalledWith('info', 'Dev mode: forceDevUpdateConfig enabled');
          }
        ),
        { numRuns: 20 }
      );
    });

    it('P008: Logging occurs when allowPrerelease enabled', () => {
      fc.assert(
        fc.property(
          fc.boolean().filter(b => b === true),
          (prereleaseEnabled) => {
            const { setupUpdater } = require('./controller');
            mockLog.mockClear();

            const devConfig = {
              forceDevUpdateConfig: false,
              devUpdateSource: undefined,
              allowPrerelease: prereleaseEnabled,
            };

            const config = {
              autoUpdate: true,
              logLevel: 'info' as const,
            };

            setupUpdater(true, config, devConfig);

            expect(mockLog).toHaveBeenCalledWith('info', 'Dev mode: allowPrerelease enabled');
          }
        ),
        { numRuns: 20 }
      );
    });

    it('P009: Logging occurs when devUpdateSource set', () => {
      fc.assert(
        fc.property(
          fc.webUrl(),
          (updateSource) => {
            const { setupUpdater } = require('./controller');
            mockLog.mockClear();

            const devConfig = {
              forceDevUpdateConfig: false,
              devUpdateSource: updateSource,
              allowPrerelease: false,
            };

            const config = {
              autoUpdate: true,
              logLevel: 'info' as const,
            };

            setupUpdater(true, config, devConfig);

            expect(mockLog).toHaveBeenCalledWith('info', `Dev mode: using custom update source: ${updateSource}`);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('P010: Feed URL always logged', () => {
      fc.assert(
        fc.property(
          fc.record({
            devUpdateSource: fc.option(fc.webUrl(), { nil: undefined }),
            manifestUrl: fc.option(fc.webUrl().map(url => url + '/manifest.json'), { nil: undefined }),
          }),
          ({ devUpdateSource, manifestUrl }) => {
            const { setupUpdater } = require('./controller');
            mockLog.mockClear();

            const devConfig = {
              forceDevUpdateConfig: false,
              devUpdateSource,
              allowPrerelease: false,
            };

            const config = {
              autoUpdate: true,
              logLevel: 'info' as const,
              manifestUrl,
            };

            setupUpdater(true, config, devConfig);

            let expectedUrl: string;
            if (devUpdateSource) {
              expectedUrl = devUpdateSource;
            } else if (manifestUrl) {
              expectedUrl = manifestUrl.replace(/\/manifest\.json$/, '');
            } else {
              expectedUrl = 'https://github.com/941design/slim-chat/releases/download/v1.0.0';
            }

            expect(mockLog).toHaveBeenCalledWith('info', `Update feed URL configured: ${expectedUrl}`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('P011: setFeedURL always called with generic provider', () => {
      fc.assert(
        fc.property(
          fc.record({
            devUpdateSource: fc.option(fc.webUrl(), { nil: undefined }),
            manifestUrl: fc.option(fc.webUrl(), { nil: undefined }),
          }),
          ({ devUpdateSource, manifestUrl }) => {
            const { setupUpdater } = require('./controller');
            mockAutoUpdater.setFeedURL.mockClear();

            const devConfig = {
              forceDevUpdateConfig: false,
              devUpdateSource,
              allowPrerelease: false,
            };

            const config = {
              autoUpdate: true,
              logLevel: 'info' as const,
              manifestUrl,
            };

            setupUpdater(true, config, devConfig);

            expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledTimes(1);
            const callArgs = mockAutoUpdater.setFeedURL.mock.calls[0][0];
            expect(callArgs.provider).toBe('generic');
            expect(typeof callArgs.url).toBe('string');
            expect(callArgs.url.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Example-Based Critical Tests', () => {
    it('E001: Production mode with no dev config', () => {
      const { setupUpdater } = require('./controller');

      const devConfig = {
        forceDevUpdateConfig: false,
        devUpdateSource: undefined,
        allowPrerelease: false,
      };

      const config = {
        autoUpdate: true,
        logLevel: 'info' as const,
        manifestUrl: 'https://example.com/updates/manifest.json',
      };

      setupUpdater(false, config, devConfig);

      expect(mockAutoUpdater.autoDownload).toBe(false);
      expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(false);
      expect(mockAutoUpdater.forceDevUpdateConfig).toBe(false);
      expect(mockAutoUpdater.allowPrerelease).toBe(false);
      expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith({
        provider: 'generic',
        url: 'https://example.com/updates',
      });
    });

    it('E002: Dev mode with GitHub releases', () => {
      const { setupUpdater } = require('./controller');

      const devConfig = {
        forceDevUpdateConfig: true,
        devUpdateSource: 'https://github.com/941design/slim-chat/releases/download/v1.0.0',
        allowPrerelease: false,
      };

      const config = {
        autoUpdate: true,
        logLevel: 'info' as const,
      };

      setupUpdater(true, config, devConfig);

      expect(mockAutoUpdater.forceDevUpdateConfig).toBe(true);
      expect(mockAutoUpdater.allowPrerelease).toBe(false);
      expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith({
        provider: 'generic',
        url: 'https://github.com/941design/slim-chat/releases/download/v1.0.0',
      });
    });

    it('E003: Dev mode with local manifest', () => {
      const { setupUpdater } = require('./controller');

      const devConfig = {
        forceDevUpdateConfig: true,
        devUpdateSource: 'file://./test-manifests/v1.0.0',
        allowPrerelease: true,
      };

      const config = {
        autoUpdate: true,
        logLevel: 'info' as const,
      };

      setupUpdater(true, config, devConfig);

      expect(mockAutoUpdater.forceDevUpdateConfig).toBe(true);
      expect(mockAutoUpdater.allowPrerelease).toBe(true);
      expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith({
        provider: 'generic',
        url: 'file://./test-manifests/v1.0.0',
      });
    });

    it('E004: Dev mode with env override', () => {
      const { setupUpdater } = require('./controller');

      const devConfig = {
        forceDevUpdateConfig: true,
        devUpdateSource: 'https://dev-server.com/updates',
        allowPrerelease: true,
      };

      const config = {
        autoUpdate: true,
        logLevel: 'info' as const,
        forceDevUpdateConfig: false,
        devUpdateSource: 'https://config-server.com/updates',
        allowPrerelease: false,
      };

      setupUpdater(true, config, devConfig);

      expect(mockAutoUpdater.forceDevUpdateConfig).toBe(true);
      expect(mockAutoUpdater.allowPrerelease).toBe(true);
      expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith({
        provider: 'generic',
        url: 'https://dev-server.com/updates',
      });
    });

    it('E005: Config values NOT used when devConfig indicates production (C1 production safety)', () => {
      const { setupUpdater } = require('./controller');

      const devConfig = {
        forceDevUpdateConfig: false,
        devUpdateSource: undefined,
        allowPrerelease: false,
      };

      const config = {
        autoUpdate: true,
        logLevel: 'info' as const,
        forceDevUpdateConfig: true,
        allowPrerelease: true,
      };

      setupUpdater(true, config, devConfig);

      // CRITICAL: Production safety - config.json values MUST NOT leak when devConfig indicates production
      expect(mockAutoUpdater.forceDevUpdateConfig).toBe(false);
      expect(mockAutoUpdater.allowPrerelease).toBe(false);
    });

    it('E006: Default GitHub URL when no sources specified', () => {
      const { setupUpdater } = require('./controller');

      const devConfig = {
        forceDevUpdateConfig: false,
        devUpdateSource: undefined,
        allowPrerelease: false,
      };

      const config = {
        autoUpdate: true,
        logLevel: 'info' as const,
      };

      setupUpdater(true, config, devConfig);

      expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith({
        provider: 'generic',
        url: 'https://github.com/941design/slim-chat/releases/download/v1.0.0',
      });
    });

    it('E007: manifestUrl without /manifest.json suffix handled correctly', () => {
      const { setupUpdater } = require('./controller');

      const devConfig = {
        forceDevUpdateConfig: false,
        devUpdateSource: undefined,
        allowPrerelease: false,
      };

      const config = {
        autoUpdate: true,
        logLevel: 'info' as const,
        manifestUrl: 'https://example.com/updates/v1.0.0',
      };

      setupUpdater(true, config, devConfig);

      expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith({
        provider: 'generic',
        url: 'https://example.com/updates/v1.0.0',
      });
    });

    it('E008: Both devConfig and config values set, devConfig wins', () => {
      const { setupUpdater } = require('./controller');

      const devConfig = {
        forceDevUpdateConfig: true,
        devUpdateSource: 'https://dev.example.com',
        allowPrerelease: true,
      };

      const config = {
        autoUpdate: true,
        logLevel: 'info' as const,
        forceDevUpdateConfig: false,
        devUpdateSource: 'https://config.example.com',
        allowPrerelease: false,
        manifestUrl: 'https://manifest.example.com/manifest.json',
      };

      setupUpdater(false, config, devConfig);

      expect(mockAutoUpdater.forceDevUpdateConfig).toBe(true);
      expect(mockAutoUpdater.allowPrerelease).toBe(true);
      expect(mockAutoUpdater.autoDownload).toBe(false);
      expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith({
        provider: 'generic',
        url: 'https://dev.example.com',
      });
    });

    it('E009: Partial devConfig (only forceDevUpdateConfig set)', () => {
      const { setupUpdater } = require('./controller');

      const devConfig = {
        forceDevUpdateConfig: true,
        devUpdateSource: undefined,
        allowPrerelease: false,
      };

      const config = {
        autoUpdate: true,
        logLevel: 'info' as const,
        devUpdateSource: 'https://config.example.com',
        manifestUrl: 'https://manifest.example.com/manifest.json',
      };

      setupUpdater(true, config, devConfig);

      expect(mockAutoUpdater.forceDevUpdateConfig).toBe(true);
      expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith({
        provider: 'generic',
        url: 'https://config.example.com',
      });
    });

    it('E010: All false/undefined produces safe defaults', () => {
      const { setupUpdater } = require('./controller');

      const devConfig = {
        forceDevUpdateConfig: false,
        devUpdateSource: undefined,
        allowPrerelease: false,
      };

      const config = {
        autoUpdate: true,
        logLevel: 'info' as const,
      };

      setupUpdater(true, config, devConfig);

      expect(mockAutoUpdater.forceDevUpdateConfig).toBe(false);
      expect(mockAutoUpdater.allowPrerelease).toBe(false);
      expect(mockAutoUpdater.autoDownload).toBe(true);
      expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(false);
      expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith({
        provider: 'generic',
        url: 'https://github.com/941design/slim-chat/releases/download/v1.0.0',
      });
    });
  });
});
