/**
 * State Machine Event Handler Tests
 *
 * Tests verify autoUpdater event handlers manage state transitions correctly:
 * - FR4 Critical: checking → failed on error (UI never stuck in checking)
 * - Broadcast consistency: Every state change triggers broadcast
 * - Version tracking: Version info preserved through multi-phase transitions
 * - Verification workflow: downloaded → verifying → ready/failed
 * - Error handling: All errors result in failed state with detail
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fc from 'fast-check';
import { EventEmitter } from 'events';
import type { UpdateInfo } from 'electron-updater';
import type { UpdateState } from '../shared/types';

const mockWindow = {
  loadURL: jest.fn(),
  loadFile: jest.fn(),
  webContents: {
    openDevTools: jest.fn(),
  },
};

jest.mock('electron', () => ({
  app: {
    getVersion: jest.fn(() => '1.0.0'),
    on: jest.fn(),
  },
  BrowserWindow: jest.fn(() => mockWindow),
}));

jest.mock('./logging', () => ({
  log: jest.fn(),
  getRecentLogs: jest.fn(() => []),
  setLogLevel: jest.fn(),
}));

jest.mock('./config', () => ({
  loadConfig: jest.fn(() => ({
    autoUpdate: true,
    logLevel: 'info',
    autoUpdateBehavior: 'manual',
  })),
  saveConfig: jest.fn(),
}));

jest.mock('./integration', () => ({
  verifyDownloadedUpdate: jest.fn(),
  constructManifestUrl: jest.fn(() => 'https://github.com/941design/slim-chat/releases/latest/download/manifest.json'),
}));

jest.mock('./ipc/handlers', () => ({
  registerHandlers: jest.fn(),
  broadcastUpdateState: jest.fn(),
}));

jest.mock('./update/controller', () => ({
  setupUpdater: jest.fn(),
  downloadUpdate: jest.fn(),
}));

jest.mock('./dev-env', () => ({
  getDevUpdateConfig: jest.fn(() => ({
    enabled: false,
    source: undefined,
    allowPrerelease: false,
  })),
}));

const mockAutoUpdater = new EventEmitter();
jest.mock('electron-updater', () => ({
  autoUpdater: mockAutoUpdater,
}));

describe('Auto-updater state machine event handlers', () => {
  let broadcastMock: jest.Mock;
  let verifyMock: jest.Mock;
  let logMock: jest.Mock;

  const getLastBroadcastedState = (): UpdateState | null => {
    const calls = broadcastMock.mock.calls;
    if (calls.length === 0) return null;
    return calls[calls.length - 1][0] as UpdateState;
  };

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    mockAutoUpdater.removeAllListeners();

    const { app } = await import('electron');
    const { broadcastUpdateState } = await import('./ipc/handlers');
    const { verifyDownloadedUpdate } = await import('./integration');
    const { log } = await import('./logging');

    broadcastMock = broadcastUpdateState as unknown as jest.Mock;
    verifyMock = verifyDownloadedUpdate as unknown as jest.Mock;
    logMock = log as unknown as jest.Mock;

    await import('./index');

    const appOnMock = app.on as unknown as jest.Mock;
    const readyCallback = appOnMock.mock.calls.find((call: any) => call[0] === 'ready')?.[1];
    if (readyCallback && typeof readyCallback === 'function') {
      (readyCallback as Function)();
    }

    broadcastMock.mockClear();
    verifyMock.mockClear();
    logMock.mockClear();
  });

  afterEach(() => {
    mockAutoUpdater.removeAllListeners();
  });

  describe('Property-Based Tests', () => {
    it('P1: FR4 CRITICAL - error event from checking always transitions to failed', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 100 }), (errorMsg) => {
          mockAutoUpdater.emit('checking-for-update');
          const stateAfterChecking = getLastBroadcastedState();
          expect(stateAfterChecking?.phase).toBe('checking');

          broadcastMock.mockClear();

          mockAutoUpdater.emit('error', new Error(errorMsg));
          const stateAfterError = getLastBroadcastedState();

          expect(stateAfterError?.phase).toBe('failed');
          expect(stateAfterError?.detail).toContain(errorMsg);
          expect(broadcastMock).toHaveBeenCalledTimes(1);
        }),
        { numRuns: 50 }
      );
    });

    it('P2: Every event triggers exactly one broadcastUpdateState call', () => {
      const events = [
        { name: 'checking-for-update', payload: undefined },
        { name: 'update-not-available', payload: undefined },
        { name: 'update-available', payload: { version: '2.0.0' } },
        { name: 'error', payload: new Error('test') },
      ];

      fc.assert(
        fc.property(fc.constantFrom(...events), (event) => {
          broadcastMock.mockClear();

          if (event.payload !== undefined) {
            mockAutoUpdater.emit(event.name, event.payload);
          } else {
            mockAutoUpdater.emit(event.name);
          }

          expect(broadcastMock).toHaveBeenCalledTimes(1);
        }),
        { numRuns: 40 }
      );
    });

    it('P3: Version info preserved through multi-phase transitions', () => {
      const versionArbitrary = fc
        .tuple(fc.nat({ max: 99 }), fc.nat({ max: 99 }), fc.nat({ max: 99 }))
        .map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

      fc.assert(
        fc.property(versionArbitrary, (version) => {
          const updateInfo: UpdateInfo = {
            version,
            files: [],
            path: '',
            sha512: '',
            releaseDate: new Date().toISOString(),
          };

          mockAutoUpdater.emit('update-available', updateInfo);
          expect(getLastBroadcastedState()?.version).toBe(version);

          mockAutoUpdater.emit('download-progress', {});
          const downloadingState = getLastBroadcastedState();
          expect(downloadingState?.version).toBe(version);
          expect(downloadingState?.phase).toBe('downloading');
        }),
        { numRuns: 50 }
      );
    });

    it('P4: Verification success path - downloaded → verifying → ready', async () => {
      const versionArbitrary = fc
        .tuple(fc.nat({ max: 99 }), fc.nat({ max: 99 }), fc.nat({ max: 99 }))
        .map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

      await fc.assert(
        fc.asyncProperty(versionArbitrary, async (version) => {
          (verifyMock.mockResolvedValueOnce as any)(undefined);

          const updateInfo: UpdateInfo = {
            version,
            files: [],
            path: '',
            sha512: '',
            releaseDate: new Date().toISOString(),
          };

          const downloadedPromise = new Promise<void>((resolve, reject) => {
            let callCount = 0;
            const originalImpl = broadcastMock.getMockImplementation();
            broadcastMock.mockImplementation((...args: any[]) => {
              if (originalImpl) originalImpl(...args);
              callCount++;
              if (callCount === 3) {
                setTimeout(() => {
                  try {
                    const finalState = getLastBroadcastedState();
                    expect(finalState?.phase).toBe('ready');
                    expect(finalState?.version).toBe(version);
                    resolve();
                  } catch (error) {
                    reject(error);
                  }
                }, 10);
              }
            });
          });

          mockAutoUpdater.emit('update-downloaded', updateInfo);

          await downloadedPromise;
        }),
        { numRuns: 20 }
      );
    });

    it('P5: Verification failure path - downloaded → verifying → failed', async () => {
      const versionArbitrary = fc
        .tuple(fc.nat({ max: 99 }), fc.nat({ max: 99 }), fc.nat({ max: 99 }))
        .map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

      await fc.assert(
        fc.asyncProperty(
          versionArbitrary,
          fc.string({ minLength: 10, maxLength: 50 }),
          async (version, errorMsg) => {
            (verifyMock.mockRejectedValueOnce as any)(new Error(errorMsg));

            const updateInfo: UpdateInfo = {
              version,
              files: [],
              path: '',
              sha512: '',
              releaseDate: new Date().toISOString(),
            };

            const downloadedPromise = new Promise<void>((resolve, reject) => {
              let callCount = 0;
              const originalImpl = broadcastMock.getMockImplementation();
              broadcastMock.mockImplementation((...args: any[]) => {
                if (originalImpl) originalImpl(...args);
                callCount++;
                if (callCount === 3) {
                  setTimeout(() => {
                    try {
                      const finalState = getLastBroadcastedState();
                      expect(finalState?.phase).toBe('failed');
                      expect(finalState?.detail).toContain(errorMsg);
                      resolve();
                    } catch (error) {
                      reject(error);
                    }
                  }, 10);
                }
              });
            });

            mockAutoUpdater.emit('update-downloaded', updateInfo);

            await downloadedPromise;
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Example-Based Critical Tests', () => {
    it('E1: checking-for-update sets state to checking', () => {
      mockAutoUpdater.emit('checking-for-update');

      const state = getLastBroadcastedState();
      expect(state?.phase).toBe('checking');
      expect(broadcastMock).toHaveBeenCalledTimes(1);
    });

    it('E2: update-available captures version', () => {
      const updateInfo: UpdateInfo = {
        version: '2.5.0',
        files: [],
        path: '',
        sha512: '',
        releaseDate: new Date().toISOString(),
      };

      mockAutoUpdater.emit('update-available', updateInfo);

      const state = getLastBroadcastedState();
      expect(state?.phase).toBe('available');
      expect(state?.version).toBe('2.5.0');
      expect(broadcastMock).toHaveBeenCalledTimes(1);
      expect(logMock).toHaveBeenCalledWith('info', expect.stringContaining('2.5.0'));
    });

    it('E3: error event includes error detail', () => {
      const error = new Error('Network timeout');

      mockAutoUpdater.emit('error', error);

      const state = getLastBroadcastedState();
      expect(state?.phase).toBe('failed');
      expect(state?.detail).toContain('Network timeout');
      expect(broadcastMock).toHaveBeenCalledTimes(1);
      expect(logMock).toHaveBeenCalledWith('error', expect.stringContaining('Network timeout'));
    });

    it('E4: download-progress preserves version from update-available', () => {
      const updateInfo: UpdateInfo = {
        version: '3.0.0',
        files: [],
        path: '',
        sha512: '',
        releaseDate: new Date().toISOString(),
      };

      mockAutoUpdater.emit('update-available', updateInfo);
      expect(getLastBroadcastedState()?.version).toBe('3.0.0');

      mockAutoUpdater.emit('download-progress', {});

      const state = getLastBroadcastedState();
      expect(state?.phase).toBe('downloading');
      expect(state?.version).toBe('3.0.0');
      expect(broadcastMock).toHaveBeenCalledTimes(2);
    });

    it('E5: update-not-available resets to idle', () => {
      mockAutoUpdater.emit('checking-for-update');
      expect(getLastBroadcastedState()?.phase).toBe('checking');

      mockAutoUpdater.emit('update-not-available');

      const state = getLastBroadcastedState();
      expect(state?.phase).toBe('idle');
      expect(broadcastMock).toHaveBeenCalledTimes(2);
    });

    it('E6: error event from any phase transitions to failed', () => {
      mockAutoUpdater.emit('checking-for-update');
      expect(getLastBroadcastedState()?.phase).toBe('checking');

      mockAutoUpdater.emit('error', new Error('From checking'));
      const state = getLastBroadcastedState();
      expect(state?.phase).toBe('failed');
      expect(state?.detail).toContain('From checking');
    });

    it('E7: update-downloaded success workflow - full sequence', async () => {
      (verifyMock.mockResolvedValueOnce as any)(undefined);

      const updateInfo: UpdateInfo = {
        version: '4.0.0',
        files: [],
        path: '',
        sha512: '',
        releaseDate: new Date().toISOString(),
      };

      const emittedPromise = new Promise<void>((resolve) => {
        let callCount = 0;
        const originalImpl = broadcastMock.getMockImplementation();
        broadcastMock.mockImplementation((...args: any[]) => {
          if (originalImpl) originalImpl(...args);
          callCount++;
          if (callCount === 3) {
            // After downloaded, verifying, ready
            setTimeout(resolve, 10);
          }
        });
      });

      mockAutoUpdater.emit('update-downloaded', updateInfo);

      await emittedPromise;

      const finalState = getLastBroadcastedState();
      expect(finalState?.phase).toBe('ready');
      expect(finalState?.version).toBe('4.0.0');
      expect(verifyMock).toHaveBeenCalledTimes(1);
    });

    it('E8: update-downloaded failure workflow - verification fails', async () => {
      const verificationError = new Error('Signature mismatch');
      (verifyMock.mockRejectedValueOnce as any)(verificationError);

      const updateInfo: UpdateInfo = {
        version: '5.0.0',
        files: [],
        path: '',
        sha512: '',
        releaseDate: new Date().toISOString(),
      };

      const emittedPromise = new Promise<void>((resolve) => {
        let callCount = 0;
        const originalImpl = broadcastMock.getMockImplementation();
        broadcastMock.mockImplementation((...args: any[]) => {
          if (originalImpl) originalImpl(...args);
          callCount++;
          if (callCount === 3) {
            // After downloaded, verifying, failed
            setTimeout(resolve, 10);
          }
        });
      });

      mockAutoUpdater.emit('update-downloaded', updateInfo);

      await emittedPromise;

      const finalState = getLastBroadcastedState();
      expect(finalState?.phase).toBe('failed');
      expect(finalState?.detail).toContain('Signature mismatch');
      expect(logMock).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('Manifest verification failed')
      );
    });

    it('E9: FR4 verification - checking never stuck after error', () => {
      mockAutoUpdater.emit('checking-for-update');
      expect(getLastBroadcastedState()?.phase).toBe('checking');

      const callsBefore = broadcastMock.mock.calls.length;

      mockAutoUpdater.emit('error', new Error('Update check failed'));

      const state = getLastBroadcastedState();
      expect(state?.phase).toBe('failed');
      expect(state?.phase).not.toBe('checking');
      expect(broadcastMock.mock.calls.length).toBe(callsBefore + 1);
    });
  });

  describe('State Transition Determinism', () => {
    it('Same event from same state produces same next state', () => {
      for (let i = 0; i < 3; i++) {
        mockAutoUpdater.emit('checking-for-update');
        expect(getLastBroadcastedState()?.phase).toBe('checking');

        mockAutoUpdater.emit('update-not-available');
        expect(getLastBroadcastedState()?.phase).toBe('idle');
      }
    });

    it('Error always transitions to failed regardless of current phase', () => {
      const phases = ['checking', 'available', 'downloading'];

      phases.forEach((expectedPhase) => {
        if (expectedPhase === 'checking') {
          mockAutoUpdater.emit('checking-for-update');
        } else if (expectedPhase === 'available') {
          mockAutoUpdater.emit('update-available', { version: '1.0.0' } as UpdateInfo);
        } else if (expectedPhase === 'downloading') {
          mockAutoUpdater.emit('update-available', { version: '1.0.0' } as UpdateInfo);
          mockAutoUpdater.emit('download-progress', {});
        }

        expect(getLastBroadcastedState()?.phase).toBe(expectedPhase);

        mockAutoUpdater.emit('error', new Error(`From ${expectedPhase}`));
        const state = getLastBroadcastedState();
        expect(state?.phase).toBe('failed');
        expect(state?.detail).toBeTruthy();
      });
    });
  });
});
