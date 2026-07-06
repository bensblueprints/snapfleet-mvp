// Desktop mode: boots the same Express server on a free local port,
// stores data in Electron's userData dir, and opens a window auto-logged-in
// as admin. Screenshots still render through the puppeteer-managed Chromium
// (NOT Electron's) — the server code is reused unchanged.
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const crypto = require('crypto');

let win;
let expressApp;

app.whenReady().then(async () => {
  const dataDir = path.join(app.getPath('userData'), 'data');
  const autologinToken = crypto.randomBytes(24).toString('hex');

  const { createApp } = require(path.join(__dirname, '..', 'server', 'app.js'));
  expressApp = createApp({
    dbPath: path.join(dataDir, 'snapfleet.db'),
    shotsDir: path.join(dataDir, 'shots'),
    autologinToken,
    adminPassword: process.env.ADMIN_PASSWORD || 'admin'
  });

  // listen on port 0 → OS picks a free port (no collisions with a VPS install)
  const listener = expressApp.listen(0, '127.0.0.1', () => {
    const port = listener.address().port;
    win = new BrowserWindow({
      width: 1360,
      height: 880,
      autoHideMenuBar: true,
      backgroundColor: '#09090b',
      title: 'Snapfleet',
      webPreferences: { contextIsolation: true, nodeIntegration: false }
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });
    win.loadURL(`http://127.0.0.1:${port}/auth/auto?token=${autologinToken}`);
  });

  app.on('window-all-closed', async () => {
    listener.close();
    try {
      await expressApp.locals.shutdown(); // close our own Puppeteer browser
    } catch { /* already closed */ }
    app.quit();
  });
});
