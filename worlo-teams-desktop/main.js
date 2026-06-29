const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 480,
    minHeight: 560,
    title: 'worlo Teams',
    icon: path.join(__dirname, 'build', 'icon.png'),
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
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
