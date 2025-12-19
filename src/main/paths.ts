/**
 * Centralized path resolution for Nostling
 *
 * Respects NOSTLING_DATA_DIR environment variable for dev/test isolation.
 * When set, all user data is stored in this directory instead of system defaults.
 */
import { app } from 'electron';
import path from 'path';

let customDataDir: string | null = null;

// Bootstrap logging colors (used before main logger is available)
const BOOT_COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  info: '\x1b[32m',
};

function bootLog(message: string): void {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
  console.log(`${BOOT_COLORS.dim}${time}${BOOT_COLORS.reset} ${BOOT_COLORS.info}INFO ${BOOT_COLORS.reset} ${message}`);
}

/**
 * Initialize paths module. Must be called before any other path functions.
 * Reads NOSTLING_DATA_DIR from environment.
 */
export function initializePaths(): void {
  const envPath = process.env.NOSTLING_DATA_DIR;
  if (envPath) {
    customDataDir = path.resolve(envPath);
    bootLog(`[paths] Using custom data directory: ${customDataDir}`);
  }
}

/**
 * Get the user data directory.
 * Returns NOSTLING_DATA_DIR if set, otherwise Electron's default userData path.
 */
export function getUserDataPath(): string {
  if (customDataDir) {
    return customDataDir;
  }
  return app.getPath('userData');
}

/**
 * Check if running with custom data directory (dev/test mode)
 */
export function isCustomDataDir(): boolean {
  return customDataDir !== null;
}
