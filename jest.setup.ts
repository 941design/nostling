/**
 * Jest Global Setup
 *
 * Suppress expected console warnings during tests.
 */

// Mock Electron's app module for tests that trigger logging
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn().mockReturnValue('/tmp/nostling-test'),
    getVersion: jest.fn().mockReturnValue('1.0.0'),
    on: jest.fn(),
    quit: jest.fn(),
    isPackaged: false,
  },
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn(),
    removeHandler: jest.fn(),
  },
  ipcRenderer: {
    invoke: jest.fn(),
    on: jest.fn(),
    send: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
  },
  BrowserWindow: jest.fn(() => ({
    loadURL: jest.fn(),
    loadFile: jest.fn(),
    webContents: {
      send: jest.fn(),
      openDevTools: jest.fn(),
    },
    on: jest.fn(),
    show: jest.fn(),
  })),
  contextBridge: {
    exposeInMainWorld: jest.fn(),
  },
  Menu: {
    setApplicationMenu: jest.fn(),
    buildFromTemplate: jest.fn(() => ({})),
  },
  shell: {
    openExternal: jest.fn(),
  },
  dialog: {
    showErrorBox: jest.fn(),
  },
}));

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

// Regex to match application log entries (colored format: "HH:MM:SS.mmm LEVEL message")
// The ANSI escape codes (\x1b[...) are part of the colored output
const APP_LOG_PATTERN = /^\x1b\[2m\d{2}:\d{2}:\d{2}\.\d{3}/;

console.log = (...args: unknown[]) => {
  const message = args[0];
  // Suppress application log entries during tests (colored format with timestamp)
  if (typeof message === 'string' && APP_LOG_PATTERN.test(message)) {
    return;
  }
  originalLog.apply(console, args);
};

console.warn = (...args: unknown[]) => {
  const message = args[0];
  // Suppress application log entries during tests (colored format with timestamp)
  if (typeof message === 'string' && APP_LOG_PATTERN.test(message)) {
    return;
  }
  if (typeof message === 'string' && message.startsWith('[url-sanitizer]')) {
    return; // Suppress url-sanitizer warnings during tests
  }
  originalWarn.apply(console, args);
};

console.error = (...args: unknown[]) => {
  const message = args[0];
  // Suppress application log entries during tests (colored format with timestamp)
  if (typeof message === 'string' && APP_LOG_PATTERN.test(message)) {
    return;
  }
  originalError.apply(console, args);
};
