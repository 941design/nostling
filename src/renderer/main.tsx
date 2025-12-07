import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import { AppStatus, UpdateState } from '../shared/types';
import './types.d.ts';

const initialUpdateState: UpdateState = { phase: 'idle' };

function useStatus() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState>(initialUpdateState);

  useEffect(() => {
    async function load() {
      const next = await window.api.getStatus();
      setStatus(next);
      setUpdateState(next.updateState);
    }
    load();
    const unsubscribe = window.api.onUpdateState((state) => setUpdateState(state));
    return unsubscribe;
  }, []);

  // CODE QUALITY: Add error handling for async IPC calls
  // Prevents unhandled promise rejections from IPC failures
  const refresh = async () => {
    try {
      await window.api.checkForUpdates();
    } catch (error) {
      console.error('Failed to check for updates:', error);
    }
  };

  const restart = async () => {
    try {
      await window.api.restartToUpdate();
    } catch (error) {
      console.error('Failed to restart:', error);
    }
  };

  // BUG FIX: Add download function for 'available' phase
  // Root cause: handlePrimary() was calling onCheck() for all non-ready phases
  // Bug report: bug-reports/download-update-button-not-working-report.md
  // Fixed: 2025-12-07
  const download = async () => {
    try {
      await window.api.updates.downloadUpdate();
    } catch (error) {
      console.error('Failed to download update:', error);
    }
  };

  return { status, updateState, refresh, restart, download };
}

function Header() {
  return (
    <header className="app-header">
      <div className="brand">SlimChat Bootstrap</div>
      <div className="subtitle">Secure auto-update shell</div>
    </header>
  );
}

function Footer({ version }: { version?: string }) {
  return (
    <footer className="app-footer">
      <span>{version ? `v${version}` : 'Loading version...'}</span>
      <span className="mono">RSA manifest verification enabled</span>
    </footer>
  );
}

function Sidebar({ updateState, onCheck, onRestart, onDownload }: { updateState: UpdateState; onCheck: () => void; onRestart: () => void; onDownload: () => void }) {
  const buttonLabel = useMemo(() => {
    switch (updateState.phase) {
      case 'checking':
        return 'Checking...';
      case 'available':
        return 'Download update';
      case 'downloading':
        return 'Downloading...';
      case 'downloaded':
      case 'verifying':
        return 'Verifying...';
      case 'ready':
        return 'Restart to apply';
      case 'failed':
        return 'Retry';
      default:
        return 'Check for updates';
    }
  }, [updateState.phase]);

  const detail = updateState.detail || updateState.version;

  // BUG FIX: Differentiate 'available' phase to call onDownload
  // Root cause: Was calling onCheck() for all non-ready phases including 'available'
  // Bug report: bug-reports/download-update-button-not-working-report.md
  // Fixed: 2025-12-07
  const handlePrimary = () => {
    if (updateState.phase === 'ready') {
      onRestart();
    } else if (updateState.phase === 'available') {
      onDownload();
    } else {
      onCheck();
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <h3>Status</h3>
        <p className="update-phase">Update: {updateState.phase}</p>
        {detail && <p className="muted">{detail}</p>}
      </div>
      <div className="sidebar-section">
        <button className="primary" onClick={handlePrimary} disabled={updateState.phase === 'checking' || updateState.phase === 'downloading' || updateState.phase === 'verifying'}>
          {buttonLabel}
        </button>
        {updateState.phase === 'ready' && (
          <button className="secondary" onClick={onRestart}>
            Restart now
          </button>
        )}
      </div>
      <div className="sidebar-footer">
        <div className="small">Updates served via GitHub Releases</div>
        <div className="small">Manifest signature required</div>
      </div>
    </aside>
  );
}

function StatusDashboard({ status }: { status: AppStatus }) {
  return (
    <div className="dashboard">
      <h2>Status dashboard</h2>
      <div className="grid">
        <InfoCard title="Version" value={`v${status.version}`} />
        <InfoCard title="Platform" value={status.platform} />
        <InfoCard title="Last update check" value={status.lastUpdateCheck ? new Date(status.lastUpdateCheck).toLocaleString() : 'Not yet checked'} />
      </div>
      <LogPanel logs={status.logs} />
    </div>
  );
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <div className="card-value">{value}</div>
    </div>
  );
}

function LogPanel({ logs }: { logs: AppStatus['logs'] }) {
  return (
    <section className="log-panel">
      <div className="log-header">
        <h3>Recent update logs</h3>
      </div>
      <div className="log-list">
        {logs.length === 0 && <div className="muted">No logs yet</div>}
        {logs.map((log) => (
          <div key={`${log.timestamp}-${log.message}`} className={`log-entry ${log.level}`}>
            <span className="mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
            <span className="level">{log.level}</span>
            <span className="message">{log.message}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function App() {
  const { status, updateState, refresh, restart, download } = useStatus();

  return (
    <div className="app-shell">
      <Header />
      <div className="body">
        <Sidebar updateState={updateState} onCheck={refresh} onRestart={restart} onDownload={download} />
        <main className="content">
          {status ? <StatusDashboard status={{ ...status, updateState }} /> : <div className="muted">Loading...</div>}
        </main>
      </div>
      <Footer version={status?.version} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
