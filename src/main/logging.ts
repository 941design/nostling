import fs from 'fs';
import path from 'path';
import { LogEntry, LogLevel } from '../shared/types';
import { getUserDataPath } from './paths';

// Lazy evaluation to ensure paths are initialized before use
function getLogFile(): string {
  return path.join(getUserDataPath(), 'logs', 'app.log');
}
const MAX_LINES = 200;

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

// ANSI color codes for terminal output
const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  // Level colors
  debug: '\x1b[36m',    // Cyan
  info: '\x1b[32m',     // Green
  warn: '\x1b[33m',     // Yellow
  error: '\x1b[31m',    // Red (bright)
  // Structural colors
  timestamp: '\x1b[2m', // Dim
  message: '\x1b[0m',   // Reset (default)
} as const;

// Level labels with fixed width for alignment
const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO ',
  warn: 'WARN ',
  error: 'ERROR',
};

/**
 * Determine default log level from environment
 * Priority: NOSTLING_LOG_LEVEL env var > 'debug' for dev modes > 'info' default
 */
function getDefaultLogLevel(): LogLevel {
  const envLevel = process.env.NOSTLING_LOG_LEVEL?.toLowerCase();
  if (envLevel && ['debug', 'info', 'warn', 'error'].includes(envLevel)) {
    return envLevel as LogLevel;
  }
  // Default to debug when running in dev mode (detected by NOSTLING_DATA_DIR or NOSTLING_DEV_RELAY)
  if (process.env.NOSTLING_DATA_DIR || process.env.NOSTLING_DEV_RELAY) {
    return 'debug';
  }
  return 'info';
}

let currentLevel: LogLevel = getDefaultLogLevel();

export function setLogLevel(level: LogLevel) {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

export function log(level: LogLevel, message: string) {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[currentLevel]) {
    return;
  }
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
  };
  writeEntry(entry);
}

export function getRecentLogs(): LogEntry[] {
  try {
    const logFile = getLogFile();
    if (!fs.existsSync(logFile)) {
      return [];
    }
    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
    return lines
      .filter(Boolean)
      .slice(-MAX_LINES)
      .map((line) => JSON.parse(line) as LogEntry);
  } catch (error) {
    console.error('Failed to read logs', error);
    return [];
  }
}

/**
 * Format timestamp for console output (HH:MM:SS.mmm)
 */
function formatTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const millis = date.getMilliseconds().toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${millis}`;
}

/**
 * Format log entry with ANSI colors for console output
 */
function formatColoredLog(entry: LogEntry): string {
  const time = formatTimestamp(entry.timestamp);
  const levelColor = COLORS[entry.level];
  const levelLabel = LEVEL_LABELS[entry.level];

  return `${COLORS.timestamp}${time}${COLORS.reset} ${levelColor}${levelLabel}${COLORS.reset} ${entry.message}`;
}

function writeEntry(entry: LogEntry) {
  // Write colored output to console first (always works)
  const output = formatColoredLog(entry);
  if (entry.level === 'error') {
    console.error(output);
  } else if (entry.level === 'warn') {
    console.warn(output);
  } else {
    console.log(output);
  }

  // Then try to write to file (may fail in test environment where Electron app is not available)
  try {
    const logFile = getLogFile();
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
  } catch {
    // Silently ignore file write failures (e.g., in test environment)
    // Console output above ensures the log is still visible
  }
}
