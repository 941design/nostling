export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AppConfig {
  autoUpdate: boolean;
  logLevel: LogLevel;
  manifestUrl?: string;
  autoUpdateBehavior?: 'manual' | 'auto-download'; // GAP-005
  logRetentionDays?: number; // GAP-011
  logMaxFileSizeMB?: number; // GAP-011
}

export interface AppStatus {
  version: string;
  platform: NodeJS.Platform;
  lastUpdateCheck?: string;
  updateState: UpdateState;
  logs: LogEntry[];
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
}

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'verifying'
  | 'ready'
  | 'failed';

export interface DownloadProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

export interface UpdateState {
  phase: UpdatePhase;
  detail?: string;
  version?: string;
  progress?: DownloadProgress; // GAP-009
}

// GAP-001, GAP-008: Updated manifest structure with SHA-256 and artifacts
export interface ManifestArtifact {
  url: string;
  sha256: string; // Changed from sha512
  platform: 'darwin' | 'linux' | 'win32';
  type: 'dmg' | 'zip' | 'AppImage' | 'exe';
}

export interface SignedManifest {
  version: string;
  artifacts: ManifestArtifact[]; // Changed from files: ManifestFileEntry[]
  createdAt: string; // ISO 8601 timestamp
  signature: string; // base64
}

// GAP-007: Nested API structure
export interface UpdatesApi {
  checkNow(): Promise<void>;
  downloadUpdate(): Promise<void>; // GAP-005
  restartToUpdate(): Promise<void>;
  onUpdateState(callback: (state: UpdateState) => void): () => void;
}

export interface ConfigApi {
  get(): Promise<AppConfig>;
  set(config: Partial<AppConfig>): Promise<AppConfig>;
}

export interface SystemApi {
  getStatus(): Promise<AppStatus>;
}

export interface RendererApi {
  updates: UpdatesApi;
  config: ConfigApi;
  system: SystemApi;
}

// Legacy flat API for backward compatibility (optional)
export interface LegacyRendererApi {
  getStatus(): Promise<AppStatus>;
  checkForUpdates(): Promise<void>;
  restartToUpdate(): Promise<void>;
  onUpdateState(callback: (state: UpdateState) => void): () => void;
  getConfig(): Promise<AppConfig>;
  setConfig(config: Partial<AppConfig>): Promise<AppConfig>;
}
