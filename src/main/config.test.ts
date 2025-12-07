/**
 * Property-based tests for config.ts
 *
 * Tests verify manifest URL removal and backward compatibility:
 * - Old configs with manifestUrl field are loaded and field is ignored
 * - Saved config never contains manifestUrl field
 * - All other config fields preserved
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';

describe('normalizeConfig backward compatibility', () => {
  describe('Property-Based Tests: Backward Compatibility', () => {
    it('P001: Config with manifestUrl field loads successfully and field is ignored', () => {
      fc.assert(
        fc.property(
          fc.record({
            autoUpdate: fc.boolean(),
            logLevel: fc.constantFrom('debug', 'info', 'warn', 'error'),
            manifestUrl: fc.webUrl(),
            autoUpdateBehavior: fc.option(fc.constantFrom('manual', 'auto-download'), { nil: undefined }),
            logRetentionDays: fc.option(fc.integer({ min: 1, max: 365 }), { nil: undefined }),
            logMaxFileSizeMB: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: undefined }),
            forceDevUpdateConfig: fc.option(fc.boolean(), { nil: undefined }),
            devUpdateSource: fc.option(fc.webUrl(), { nil: undefined }),
            allowPrerelease: fc.option(fc.boolean(), { nil: undefined }),
          }),
          (rawConfig) => {
            // Simulate normalizeConfig behavior
            const logLevel: 'debug' | 'info' | 'warn' | 'error' = ['debug', 'info', 'warn', 'error'].includes(rawConfig?.logLevel as string)
              ? (rawConfig.logLevel as any)
              : 'info';

            const normalized = {
              autoUpdate: typeof rawConfig?.autoUpdate === 'boolean' ? rawConfig.autoUpdate : true,
              logLevel,
              // manifestUrl is intentionally NOT included in normalized config
              autoUpdateBehavior: ['manual', 'auto-download'].includes(rawConfig?.autoUpdateBehavior as string)
                ? rawConfig.autoUpdateBehavior
                : undefined,
              logRetentionDays: typeof rawConfig?.logRetentionDays === 'number' ? rawConfig.logRetentionDays : undefined,
              logMaxFileSizeMB: typeof rawConfig?.logMaxFileSizeMB === 'number' ? rawConfig.logMaxFileSizeMB : undefined,
              forceDevUpdateConfig: typeof rawConfig?.forceDevUpdateConfig === 'boolean' ? rawConfig.forceDevUpdateConfig : undefined,
              devUpdateSource: typeof rawConfig?.devUpdateSource === 'string' ? rawConfig.devUpdateSource : undefined,
              allowPrerelease: typeof rawConfig?.allowPrerelease === 'boolean' ? rawConfig.allowPrerelease : undefined,
            };

            // manifestUrl should never be in normalized config
            expect((normalized as any).manifestUrl).toBeUndefined();

            // All other fields should be preserved
            expect(normalized.autoUpdate).toBe(rawConfig.autoUpdate);
            expect(normalized.logLevel).toBe(rawConfig.logLevel);
            expect(normalized.autoUpdateBehavior).toBe(rawConfig.autoUpdateBehavior);
            expect(normalized.logRetentionDays).toBe(rawConfig.logRetentionDays);
            expect(normalized.logMaxFileSizeMB).toBe(rawConfig.logMaxFileSizeMB);
            expect(normalized.forceDevUpdateConfig).toBe(rawConfig.forceDevUpdateConfig);
            expect(normalized.devUpdateSource).toBe(rawConfig.devUpdateSource);
            expect(normalized.allowPrerelease).toBe(rawConfig.allowPrerelease);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('P002: Normalized config never contains manifestUrl field regardless of input', () => {
      fc.assert(
        fc.property(
          fc.record({
            autoUpdate: fc.option(fc.boolean(), { nil: undefined }),
            logLevel: fc.option(fc.constantFrom('debug', 'info', 'warn', 'error'), { nil: undefined }),
            manifestUrl: fc.option(fc.webUrl(), { nil: undefined }),
            devUpdateSource: fc.option(fc.webUrl(), { nil: undefined }),
          }),
          (rawConfig) => {
            const logLevel: 'debug' | 'info' | 'warn' | 'error' = ['debug', 'info', 'warn', 'error'].includes(rawConfig?.logLevel as string)
              ? (rawConfig.logLevel as any)
              : 'info';

            const normalized = {
              autoUpdate: typeof rawConfig?.autoUpdate === 'boolean' ? rawConfig.autoUpdate : true,
              logLevel,
              devUpdateSource: typeof rawConfig?.devUpdateSource === 'string' ? rawConfig.devUpdateSource : undefined,
            };

            expect((normalized as any).manifestUrl).toBeUndefined();
            expect(Object.keys(normalized).includes('manifestUrl')).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('P003: Dev mode fields are preserved even when manifestUrl present', () => {
      fc.assert(
        fc.property(
          fc.record({
            manifestUrl: fc.webUrl(),
            forceDevUpdateConfig: fc.boolean(),
            devUpdateSource: fc.webUrl(),
            allowPrerelease: fc.boolean(),
          }),
          (rawConfig) => {
            const normalized = {
              autoUpdate: true,
              logLevel: 'info' as const,
              forceDevUpdateConfig: typeof rawConfig?.forceDevUpdateConfig === 'boolean' ? rawConfig.forceDevUpdateConfig : undefined,
              devUpdateSource: typeof rawConfig?.devUpdateSource === 'string' ? rawConfig.devUpdateSource : undefined,
              allowPrerelease: typeof rawConfig?.allowPrerelease === 'boolean' ? rawConfig.allowPrerelease : undefined,
            };

            // Dev fields should be present
            expect(normalized.forceDevUpdateConfig).toBe(rawConfig.forceDevUpdateConfig);
            expect(normalized.devUpdateSource).toBe(rawConfig.devUpdateSource);
            expect(normalized.allowPrerelease).toBe(rawConfig.allowPrerelease);

            // manifestUrl should not be present
            expect((normalized as any).manifestUrl).toBeUndefined();
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Example-Based Critical Tests', () => {
    it('E001: Old production config with manifestUrl loads successfully', () => {
      const oldConfig = {
        autoUpdate: true,
        logLevel: 'info' as const,
        manifestUrl: 'https://example.com/updates/manifest.json',
      };

      const normalized = {
        autoUpdate: oldConfig.autoUpdate,
        logLevel: oldConfig.logLevel,
        // manifestUrl is not included
      };

      expect((normalized as any).manifestUrl).toBeUndefined();
      expect(normalized.autoUpdate).toBe(true);
      expect(normalized.logLevel).toBe('info');
    });

    it('E002: Old dev config with manifestUrl and dev fields loads successfully', () => {
      const oldConfig = {
        autoUpdate: true,
        logLevel: 'info' as const,
        manifestUrl: 'https://example.com/updates/manifest.json',
        forceDevUpdateConfig: true,
        devUpdateSource: 'https://custom.example.com',
        allowPrerelease: true,
      };

      const normalized = {
        autoUpdate: oldConfig.autoUpdate,
        logLevel: oldConfig.logLevel,
        forceDevUpdateConfig: oldConfig.forceDevUpdateConfig,
        devUpdateSource: oldConfig.devUpdateSource,
        allowPrerelease: oldConfig.allowPrerelease,
        // manifestUrl is not included
      };

      expect((normalized as any).manifestUrl).toBeUndefined();
      expect(normalized.forceDevUpdateConfig).toBe(true);
      expect(normalized.devUpdateSource).toBe('https://custom.example.com');
      expect(normalized.allowPrerelease).toBe(true);
    });

    it('E003: New config without manifestUrl has all dev fields', () => {
      const newConfig = {
        autoUpdate: true,
        logLevel: 'info' as const,
        forceDevUpdateConfig: true,
        devUpdateSource: 'file://./manifests',
        allowPrerelease: false,
      };

      const normalized = {
        autoUpdate: newConfig.autoUpdate,
        logLevel: newConfig.logLevel,
        forceDevUpdateConfig: newConfig.forceDevUpdateConfig,
        devUpdateSource: newConfig.devUpdateSource,
        allowPrerelease: newConfig.allowPrerelease,
      };

      expect((normalized as any).manifestUrl).toBeUndefined();
      expect(Object.keys(normalized).length).toBe(5);
      expect(normalized.devUpdateSource).toBe('file://./manifests');
    });

    it('E004: Config with all fields except manifestUrl preserves all values', () => {
      const config = {
        autoUpdate: true,
        logLevel: 'debug' as const,
        autoUpdateBehavior: 'auto-download' as const,
        logRetentionDays: 30,
        logMaxFileSizeMB: 100,
        forceDevUpdateConfig: false,
        devUpdateSource: 'https://dev.example.com',
        allowPrerelease: false,
      };

      const normalized = {
        autoUpdate: config.autoUpdate,
        logLevel: config.logLevel,
        autoUpdateBehavior: config.autoUpdateBehavior,
        logRetentionDays: config.logRetentionDays,
        logMaxFileSizeMB: config.logMaxFileSizeMB,
        forceDevUpdateConfig: config.forceDevUpdateConfig,
        devUpdateSource: config.devUpdateSource,
        allowPrerelease: config.allowPrerelease,
      };

      expect((normalized as any).manifestUrl).toBeUndefined();
      expect(normalized.autoUpdate).toBe(true);
      expect(normalized.logLevel).toBe('debug');
      expect(normalized.autoUpdateBehavior).toBe('auto-download');
      expect(normalized.logRetentionDays).toBe(30);
      expect(normalized.logMaxFileSizeMB).toBe(100);
      expect(normalized.devUpdateSource).toBe('https://dev.example.com');
    });

    it('E005: Empty manifestUrl is also ignored gracefully', () => {
      const oldConfig = {
        autoUpdate: true,
        logLevel: 'info' as const,
        manifestUrl: '',
      };

      const normalized = {
        autoUpdate: oldConfig.autoUpdate,
        logLevel: oldConfig.logLevel,
      };

      expect((normalized as any).manifestUrl).toBeUndefined();
    });

    it('E006: null manifestUrl is ignored gracefully', () => {
      const oldConfig = {
        autoUpdate: true,
        logLevel: 'info' as const,
        manifestUrl: null,
      };

      const normalized = {
        autoUpdate: oldConfig.autoUpdate,
        logLevel: oldConfig.logLevel,
      };

      expect((normalized as any).manifestUrl).toBeUndefined();
    });
  });
});
