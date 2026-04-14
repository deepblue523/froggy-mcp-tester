const { app, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

function isDevMode() {
  return process.argv.includes('--dev');
}

/**
 * GitHub Releases feed (public repo: no token). Private repo: set GH_TOKEN in the environment.
 * Requires electron-builder `publish` + `latest.yml` (and NSIS .exe + .blockmap) attached to each GitHub release.
 */
function setupGitHubAutoUpdater(getMainWindow) {
  ipcMain.handle('quit-and-install-update', () => {
    if (!app.isPackaged || isDevMode()) {
      return;
    }
    autoUpdater.quitAndInstall(false, true);
  });
  ipcMain.handle('check-for-updates-now', () => {
    if (!app.isPackaged || isDevMode()) {
      return Promise.resolve({ skipped: true });
    }
    return autoUpdater.checkForUpdates();
  });

  if (!app.isPackaged || isDevMode()) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const send = (payload) => {
    const win = typeof getMainWindow === 'function' ? getMainWindow() : getMainWindow;
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-channel', payload);
    }
  };

  autoUpdater.on('checking-for-update', () => send({ phase: 'checking' }));
  autoUpdater.on('update-available', (info) => {
    send({ phase: 'available', version: info.version });
  });
  autoUpdater.on('update-not-available', () => send({ phase: 'none' }));
  autoUpdater.on('error', (err) => {
    console.error('[autoUpdater]', err);
    send({ phase: 'error', message: err.message });
  });
  autoUpdater.on('download-progress', (p) => {
    send({
      phase: 'progress',
      percent: Math.round(p.percent),
      transferred: p.transferred,
      total: p.total
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    send({ phase: 'ready', version: info.version });
  });

  const runCheck = () => {
    autoUpdater.checkForUpdates().catch((e) => console.error('[autoUpdater]', e));
  };

  runCheck();
  setInterval(runCheck, CHECK_INTERVAL_MS);
}

module.exports = { setupGitHubAutoUpdater };
