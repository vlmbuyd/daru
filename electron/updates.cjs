const fs = require('node:fs');
const path = require('node:path');

function createUpdates(app, updaterFactory, platform = process.platform, resources = process.resourcesPath) {
  const enabled = app.isPackaged && platform === 'darwin'
    && fs.existsSync(path.join(resources, 'app-update.yml'));
  let state = { phase: enabled ? 'idle' : 'disabled', version: app.getVersion() };
  if (!enabled) return { status: () => state, check: async () => state, install: () => false };
  const updater = updaterFactory();
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  const set = phase => { state = { ...state, phase }; };
  updater.on('update-available', () => set('downloading'));
  updater.on('update-not-available', () => set('current'));
  updater.on('update-downloaded', info => {
    state = { ...state, phase: 'ready', nextVersion: info.version };
  });
  updater.on('error', () => set('error'));
  return {
    status: () => state,
    async check() {
      if (['checking', 'downloading', 'ready'].includes(state.phase)) return state;
      set('checking');
      try { await updater.checkForUpdates(); } catch { set('error'); }
      return state;
    },
    install() {
      if (state.phase !== 'ready') return false;
      updater.quitAndInstall();
      return true;
    },
  };
}
module.exports = { createUpdates };
