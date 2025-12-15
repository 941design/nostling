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

let currentLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel) {
  currentLevel = level;
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

function writeEntry(entry: LogEntry) {
  try {
    const logFile = getLogFile();
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
    console.log(`[${entry.timestamp}] [${entry.level}] ${entry.message}`);
  } catch (error) {
    console.error('Failed to write log', error);
  }
}
