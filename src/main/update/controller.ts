/**
 * GAP-005, GAP-009: Update control with manual download and progress tracking
 *
 * This module manages the update lifecycle with user control over downloads.
 * Replaces automatic download with user-initiated download after approval.
 */

import { app } from 'electron';
import { autoUpdater, ProgressInfo } from 'electron-updater';
import { UpdateState, DownloadProgress, AppConfig } from '../../shared/types';
import { DevUpdateConfig } from '../dev-env';
import { log } from '../logging';

/**
 * Convert electron-updater ProgressInfo to DownloadProgress
 *
 * CONTRACT:
 *   Inputs:
 *     - progressInfo: object from electron-updater with fields:
 *       - total: total bytes to download (number, may be 0 if unknown)
 *       - transferred: bytes downloaded so far (number, non-negative)
 *       - bytesPerSecond: download speed (number, non-negative)
 *       - percent: completion percentage (number, 0-100)
 *
 *   Outputs:
 *     - DownloadProgress object with fields:
 *       - percent: number, 0-100
 *       - bytesPerSecond: number, non-negative
 *       - transferred: number, non-negative
 *       - total: number, non-negative
 *
 *   Invariants:
 *     - transferred ≤ total (if total is known)
 *     - percent is clamped to 0-100 range
 *     - All numeric fields non-negative
 *
 *   Properties:
 *     - Bounded: percent is in [0, 100]
 *     - Monotonic: transferred never decreases during download
 *     - Complete: when percent = 100, transferred = total
 *
 *   Algorithm:
 *     1. Extract fields from progressInfo
 *     2. Clamp percent to range [0, 100]:
 *        - If percent < 0, use 0
 *        - If percent > 100, use 100
 *        - Otherwise use progressInfo.percent
 *     3. Return DownloadProgress object with clamped values
 */
export function convertProgress(progressInfo: ProgressInfo): DownloadProgress {
  // TRIVIAL: Implemented directly
  return {
    percent: Math.max(0, Math.min(100, progressInfo.percent)),
    bytesPerSecond: progressInfo.bytesPerSecond,
    transferred: progressInfo.transferred,
    total: progressInfo.total,
  };
}

/**
 * Format bytes as human-readable string
 *
 * CONTRACT:
 *   Inputs:
 *     - bytes: non-negative integer, number of bytes
 *
 *   Outputs:
 *     - string: formatted with appropriate unit (B, KB, MB, GB)
 *
 *   Invariants:
 *     - Uses 1024-based units (binary: KiB, MiB, GiB)
 *     - 1-2 decimal places for values ≥ 1 KB
 *     - No decimal places for bytes
 *
 *   Properties:
 *     - Monotonic: larger byte values produce larger numeric prefixes
 *     - Readable: uses appropriate unit for magnitude
 *
 *   Algorithm:
 *     1. If bytes < 1024, return "{bytes} B"
 *     2. If bytes < 1024^2, return "{bytes/1024:.1f} KB"
 *     3. If bytes < 1024^3, return "{bytes/1024^2:.1f} MB"
 *     4. Otherwise, return "{bytes/1024^3:.2f} GB"
 *
 *   Examples:
 *     - formatBytes(512) → "512 B"
 *     - formatBytes(1536) → "1.5 KB"
 *     - formatBytes(2097152) → "2.0 MB"
 *     - formatBytes(5368709120) → "5.00 GB"
 */
export function formatBytes(bytes: number): string {
  const normalized = Math.max(0, Math.floor(bytes));

  if (normalized < 1024) {
    return `${normalized} B`;
  }

  if (normalized < 1024 * 1024) {
    return `${(normalized / 1024).toFixed(1)} KB`;
  }

  if (normalized < 1024 * 1024 * 1024) {
    return `${(normalized / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(normalized / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Setup autoUpdater with manual download configuration and dev mode support
 *
 * CONTRACT:
 *   Inputs:
 *     - autoDownloadEnabled: boolean, true for automatic download, false for manual
 *     - config: AppConfig object with optional dev fields:
 *       - forceDevUpdateConfig: boolean or undefined
 *       - devUpdateSource: string (URL or file:// path) or undefined
 *       - allowPrerelease: boolean or undefined
 *     - devConfig: DevUpdateConfig object from environment:
 *       - forceDevUpdateConfig: boolean (from env vars)
 *       - devUpdateSource: string or undefined (from env vars)
 *       - allowPrerelease: boolean (from env vars)
 *
 *   Outputs:
 *     - void (side effect: configures autoUpdater instance)
 *
 *   Invariants:
 *     - autoUpdater.autoDownload set to autoDownloadEnabled
 *     - autoUpdater.autoInstallOnAppQuit always false (user must restart manually)
 *     - Production mode: use GitHub provider with owner/repo configuration
 *     - Dev mode with devUpdateSource: use generic provider for file:// URL support
 *     - In production builds: forceDevUpdateConfig and allowPrerelease NEVER enabled (constraint C1)
 *     - Environment variables take precedence over config file for dev settings
 *     - Config file values used as fallback when env vars not set
 *
 *   Properties:
 *     - Production safety: dev features disabled when devConfig indicates production mode
 *     - Precedence: env vars (devConfig) > config file (config) > defaults
 *     - Security preservation: all verification still required (constraint C2)
 *     - Backward compatibility: existing production flow unchanged when no dev config (constraint C3)
 *
 *   Algorithm:
 *     1. Set basic autoUpdater configuration (autoDownload, autoInstallOnAppQuit)
 *
 *     2. Determine effective dev mode settings (precedence: env > config > default):
 *        a. isDevModeActive = devConfig.forceDevUpdateConfig OR Boolean(devConfig.devUpdateSource) OR devConfig.allowPrerelease
 *        b. forceDevUpdateConfig = devConfig.forceDevUpdateConfig OR (isDevModeActive AND config.forceDevUpdateConfig) OR false
 *        c. devUpdateSource = devConfig.devUpdateSource OR (isDevModeActive AND config.devUpdateSource) OR undefined
 *        d. allowPrerelease = devConfig.allowPrerelease OR (isDevModeActive AND config.allowPrerelease) OR false
 *
 *     3. Configure forceDevUpdateConfig:
 *        - Set autoUpdater.forceDevUpdateConfig to effective value
 *        - Log if enabled for diagnostics (FR5)
 *
 *     4. Configure allowPrerelease:
 *        - Set autoUpdater.allowPrerelease to effective value
 *        - Log if enabled for diagnostics (FR5)
 *
 *     5. Configure feed URL based on mode:
 *        IF devUpdateSource is set:
 *          // Dev mode: use generic provider for file:// URL support
 *          autoUpdater.setFeedURL({
 *            provider: 'generic',
 *            url: devUpdateSource
 *          })
 *          log('info', `Dev mode: using custom update source: ${devUpdateSource}`)
 *        ELSE:
 *          // Production mode: use GitHub provider
 *          autoUpdater.setFeedURL({
 *            provider: 'github',
 *            owner: '941design',
 *            repo: 'slim-chat'
 *          })
 *          log('info', 'Update feed configured: GitHub provider (941design/slim-chat)')
 *
 *   Examples:
 *     Production mode (devConfig all false/undefined):
 *       - Result: GitHub provider, no dev features enabled
 *
 *     Dev mode with GitHub releases:
 *       - devConfig = { forceDevUpdateConfig: true, devUpdateSource: "https://github.com/941design/slim-chat/releases/download/v1.0.0", allowPrerelease: false }
 *       - Result: Force dev updates, generic provider with specified GitHub release, no prereleases
 *
 *     Dev mode with local manifest:
 *       - devConfig = { forceDevUpdateConfig: true, devUpdateSource: "file://./test-manifests/v1.0.0", allowPrerelease: true }
 *       - Result: Force dev updates, generic provider with local file, allow prereleases
 *
 *     Dev mode with env override:
 *       - config = { forceDevUpdateConfig: false }
 *       - devConfig = { forceDevUpdateConfig: true, ... }
 *       - Result: Env var wins, force dev updates enabled
 *
 *   Error Handling:
 *     - Invalid URLs: Passed to autoUpdater as-is (will fail gracefully per FR4)
 *     - Missing manifest: autoUpdater will transition to 'failed' state (FR4)
 *     - Network errors: Handled by autoUpdater event system (FR4)
 */
export function setupUpdater(
  autoDownloadEnabled: boolean,
  config: AppConfig,
  devConfig: DevUpdateConfig
): void {
  autoUpdater.autoDownload = autoDownloadEnabled;
  autoUpdater.autoInstallOnAppQuit = false;

  // CRITICAL: Production safety (C1) - config values ONLY used when devConfig indicates dev mode
  const isDevModeActive = devConfig.forceDevUpdateConfig || Boolean(devConfig.devUpdateSource) || devConfig.allowPrerelease;

  const forceDevUpdateConfig = devConfig.forceDevUpdateConfig || (isDevModeActive && config.forceDevUpdateConfig) || false;
  const devUpdateSource = devConfig.devUpdateSource || (isDevModeActive && config.devUpdateSource) || undefined;
  const allowPrerelease = devConfig.allowPrerelease || (isDevModeActive && config.allowPrerelease) || false;

  autoUpdater.forceDevUpdateConfig = forceDevUpdateConfig;
  if (forceDevUpdateConfig) {
    log('info', 'Dev mode: forceDevUpdateConfig enabled');
  }

  autoUpdater.allowPrerelease = allowPrerelease;
  if (allowPrerelease) {
    log('info', 'Dev mode: allowPrerelease enabled');
  }

  // Configure feed URL based on mode
  if (devUpdateSource) {
    // Dev mode: use generic provider for file:// URL support
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: devUpdateSource,
    });
    log('info', `Dev mode: using custom update source: ${devUpdateSource}`);
  } else {
    // Production mode: use GitHub provider
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: '941design',
      repo: 'slim-chat',
    });
    log('info', 'Update feed configured: GitHub provider (941design/slim-chat)');
  }
}

/**
 * Trigger manual download of available update
 *
 * CONTRACT:
 *   Inputs:
 *     - none (operates on autoUpdater global state)
 *
 *   Outputs:
 *     - promise resolving when download completes
 *     - promise rejecting if download fails
 *
 *   Invariants:
 *     - Should only be called when update is available
 *     - Download progress events emitted during download
 *
 *   Properties:
 *     - Idempotent: calling multiple times starts only one download
 *     - Asynchronous: returns promise for completion
 *
 *   Algorithm:
 *     1. Call autoUpdater.downloadUpdate()
 *     2. Await completion
 *     3. Return promise result
 *
 *   Error Conditions:
 *     - No update available: reject with updater error
 *     - Network failure: reject with network error
 *     - Disk space insufficient: reject with filesystem error
 */
export async function downloadUpdate(): Promise<void> {
  // TRIVIAL: Implemented directly
  await autoUpdater.downloadUpdate();
}
