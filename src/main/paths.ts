/**
 * Centralized path resolution for Nostling
 *
 * Respects NOSTLING_DATA_DIR environment variable for dev/test isolation.
 * When set, all user data is stored in this directory instead of system defaults.
 */
import { app } from 'electron';
import path from 'path';

let customDataDir: string | null = null;

/**
 * Initialize paths module. Must be called before any other path functions.
 * Reads NOSTLING_DATA_DIR from environment.
 */
export function initializePaths(): void {
  const envPath = process.env.NOSTLING_DATA_DIR;
  if (envPath) {
    customDataDir = path.resolve(envPath);
    console.log(`[paths] Using custom data directory: ${customDataDir}`);
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
