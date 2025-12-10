import { contextBridge, ipcRenderer } from 'electron';
import { AppConfig, AppStatus, RendererApi, UpdateState } from '../shared/types';

// LEGACY: Flat API structure (will migrate to nested in GAP-007)
const legacyApi = {
  async getStatus() {
    return ipcRenderer.invoke('status:get') as Promise<AppStatus>;
  },
  async checkForUpdates() {
    return ipcRenderer.invoke('update:check');
  },
  async restartToUpdate() {
    return ipcRenderer.invoke('update:restart');
  },
  onUpdateState(callback: (state: UpdateState) => void) {
    ipcRenderer.on('update-state', (_event, state: UpdateState) => callback(state));
    return () => ipcRenderer.removeAllListeners('update-state');
  },
  async getConfig() {
    return ipcRenderer.invoke('config:get') as Promise<AppConfig>;
  },
  async setConfig(config: Partial<AppConfig>) {
    return ipcRenderer.invoke('config:set', config) as Promise<AppConfig>;
  },
};

// NEW: Nested API structure (GAP-007) - will be implemented
const api: RendererApi = {
  updates: {
    async checkNow() {
      return ipcRenderer.invoke('updates:check');
    },
    async downloadUpdate() {
      return ipcRenderer.invoke('updates:download');
    },
    async restartToUpdate() {
      return ipcRenderer.invoke('updates:restart');
    },
    onUpdateState(callback: (state: UpdateState) => void) {
      ipcRenderer.on('update-state', (_event, state: UpdateState) => callback(state));
      return () => ipcRenderer.removeAllListeners('update-state');
    },
  },
  config: {
    async get() {
      return ipcRenderer.invoke('config:get') as Promise<AppConfig>;
    },
    async set(config: Partial<AppConfig>) {
      return ipcRenderer.invoke('config:set', config) as Promise<AppConfig>;
    },
  },
  system: {
    async getStatus() {
      return ipcRenderer.invoke('system:get-status') as Promise<AppStatus>;
    },
  },
  state: {
    async get(key: string) {
      return ipcRenderer.invoke('state:get', key) as Promise<string | null>;
    },
    async set(key: string, value: string) {
      return ipcRenderer.invoke('state:set', key, value);
    },
    async delete(key: string) {
      return ipcRenderer.invoke('state:delete', key);
    },
    async getAll() {
      return ipcRenderer.invoke('state:get-all') as Promise<Record<string, string>>;
    },
  },
};

// Expose both APIs during transition
contextBridge.exposeInMainWorld('api', { ...legacyApi, ...api });

export type {};
