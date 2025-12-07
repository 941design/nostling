import { app, BrowserWindow } from 'electron';
import path from 'path';
import { autoUpdater } from 'electron-updater';
import { AppConfig, AppStatus, UpdateState } from '../shared/types';
import { getRecentLogs, log, setLogLevel } from './logging';
import { loadConfig, saveConfig } from './config';
import { verifyDownloadedUpdate } from './integration';
import { registerHandlers, broadcastUpdateState } from './ipc/handlers';
import { downloadUpdate, setupUpdater } from './update/controller';

let mainWindow: BrowserWindow | null = null;
let config: AppConfig = loadConfig();
setLogLevel(config.logLevel);

let updateState: UpdateState = { phase: 'idle' };
let lastUpdateCheck: string | undefined;

const PUBLIC_KEY = process.env.RSA_PUBLIC_KEY ||
  '-----BEGIN PUBLIC KEY-----\nMIICIjANBgkqhkiG9w0BAQ...\n-----END PUBLIC KEY-----'; // placeholder PEM

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '../preload/index.js'),
    },
  });

  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) {
    mainWindow.loadURL(devServer);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

function broadcastUpdateStateToMain() {
  if (mainWindow) {
    broadcastUpdateState(updateState, [mainWindow]);
  }
}

function setupAutoUpdater() {
  // Configure autoUpdater based on user preference (GAP-005)
  // Default to 'manual' for safe, privacy-respecting behavior
  const autoDownloadEnabled = config.autoUpdateBehavior === 'auto-download';
  setupUpdater(autoDownloadEnabled);

  autoUpdater.on('checking-for-update', () => {
    updateState = { phase: 'checking' };
    broadcastUpdateStateToMain();
    lastUpdateCheck = new Date().toISOString();
  });

  autoUpdater.on('update-available', (info) => {
    updateState = { phase: 'available', version: info.version };
    log('info', `Update available: ${info.version}`);
    broadcastUpdateStateToMain();
  });

  autoUpdater.on('download-progress', () => {
    updateState = { phase: 'downloading', version: updateState.version };
    broadcastUpdateStateToMain();
  });

  autoUpdater.on('update-not-available', () => {
    updateState = { phase: 'idle' };
    broadcastUpdateStateToMain();
  });

  autoUpdater.on('error', (error) => {
    updateState = { phase: 'failed', detail: String(error) };
    log('error', `Updater error: ${String(error)}`);
    broadcastUpdateStateToMain();
  });

  autoUpdater.on('update-downloaded', async (info) => {
    updateState = { phase: 'downloaded', version: info.version };
    broadcastUpdateStateToMain();
    try {
      updateState = { phase: 'verifying', version: info.version };
      broadcastUpdateStateToMain();

      const manifestUrl = process.env.MANIFEST_URL || config.manifestUrl;
      if (!manifestUrl) {
        throw new Error('No manifest URL configured');
      }

      await verifyDownloadedUpdate(
        info,
        app.getVersion(),
        process.platform as 'darwin' | 'linux' | 'win32',
        PUBLIC_KEY,
        manifestUrl
      );

      updateState = { phase: 'ready', version: info.version };
      broadcastUpdateStateToMain();
    } catch (error) {
      log('error', `Manifest verification failed: ${String(error)}`);
      updateState = { phase: 'failed', detail: String(error) };
      broadcastUpdateStateToMain();
    }
  });
}

// Helper functions for IPC handlers
async function getStatus(): Promise<AppStatus> {
  return {
    version: app.getVersion(),
    platform: process.platform,
    lastUpdateCheck,
    updateState,
    logs: getRecentLogs(),
  };
}

async function checkForUpdates(): Promise<void> {
  if (!config.autoUpdate) {
    log('warn', 'Auto-update disabled in config');
    return;
  }
  updateState = { phase: 'checking' };
  broadcastUpdateStateToMain();
  lastUpdateCheck = new Date().toISOString();
  await autoUpdater.checkForUpdates();
}

async function restartToUpdate(): Promise<void> {
  if (updateState.phase === 'ready') {
    autoUpdater.quitAndInstall();
  }
}

async function getConfig(): Promise<AppConfig> {
  return config;
}

async function setConfig(partial: Partial<AppConfig>): Promise<AppConfig> {
  config = saveConfig({ ...config, ...partial });
  setLogLevel(config.logLevel);
  return config;
}

app.on('ready', () => {
  // Register IPC handlers with domain-based organization
  registerHandlers({
    getStatus,
    checkForUpdates,
    downloadUpdate,
    restartToUpdate,
    getConfig,
    setConfig,
  });
  log('info', `Starting SlimChat ${app.getVersion()}`);
  config = loadConfig();
  setLogLevel(config.logLevel);
  createWindow();
  setupAutoUpdater();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
