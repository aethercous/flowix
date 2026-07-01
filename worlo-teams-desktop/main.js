const { app, BrowserWindow, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;
const HOSTED_URL = 'https://worlo.site/teams-app/index.html';

// Prevent multiple copies fighting over the Dock (icon bouncing on repeat launch).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function resolveDockIcon() {
  const candidates = isDev
    ? [
        path.join(__dirname, 'build', 'icon.icns'),
        path.join(__dirname, 'build', 'icon.png'),
      ]
    : [
        path.join(process.resourcesPath, 'icon.icns'),
        path.join(process.resourcesPath, 'build', 'icon.icns'),
        path.join(process.resourcesPath, 'build', 'icon.png'),
      ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return nativeImage.createFromPath(p);
  }
  return null;
}

function applyDockIcon() {
  if (process.platform !== 'darwin' || !app.dock) return;
  const icon = resolveDockIcon();
  if (icon && !icon.isEmpty()) app.dock.setIcon(icon);
}

function resolveStartUrl() {
  if (process.env.WORLO_TEAMS_URL) return process.env.WORLO_TEAMS_URL;
  if (isDev) return null;
  // Hosted app is reliable; file:// breaks CSS paths and Chrome-style wrappers.
  if (process.env.WORLO_TEAMS_OFFLINE === '1') return null;
  return HOSTED_URL;
}

function createWindow() {
  const iconPath = isDev
    ? path.join(__dirname, 'build', 'icon.png')
    : path.join(process.resourcesPath, 'build', 'icon.png');

  const win = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 480,
    minHeight: 560,
    title: 'worlo Teams',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: '#f6f6f8',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  const forceShow = () => {
    if (!win.isDestroyed() && !win.isVisible()) {
      win.show();
      win.focus();
    }
  };
  setTimeout(forceShow, 2500);

  win.webContents.on('did-fail-load', (_event, code) => {
    if (code === -3) return;
    forceShow();
  });

  const startUrl = resolveStartUrl();
  if (startUrl) {
    win.loadURL(startUrl);
  } else if (isDev) {
    win.loadFile(path.join(__dirname, '..', 'teams-app', 'index.html'));
  } else {
    win.loadFile(path.join(process.resourcesPath, 'teams-app', 'index.html'));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return win;
}

let mainWindow = null;

if (gotLock) {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else {
      mainWindow = createWindow();
    }
  });

  app.whenReady().then(() => {
    applyDockIcon();
    mainWindow = createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
      } else if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
