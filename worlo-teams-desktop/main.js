const { app, BrowserWindow, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;

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
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (process.env.WORLO_TEAMS_URL) {
    win.loadURL(process.env.WORLO_TEAMS_URL);
  } else if (isDev) {
    win.loadFile(path.join(__dirname, '..', 'teams-app', 'index.html'));
  } else {
    win.loadFile(path.join(process.resourcesPath, 'teams-app', 'index.html'));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  applyDockIcon();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
