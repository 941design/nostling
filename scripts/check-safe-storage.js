const { app, safeStorage } = require('electron');

app.on('window-all-closed', () => {});

app.whenReady().then(() => {
  console.log('isEncryptionAvailable:', safeStorage.isEncryptionAvailable());
  console.log('getSelectedStorageBackend:', safeStorage.getSelectedStorageBackend());
  process.exit(0);
});

// Timeout to avoid hanging
setTimeout(() => {
  console.log('Timeout waiting for app ready');
  process.exit(1);
}, 5000);
