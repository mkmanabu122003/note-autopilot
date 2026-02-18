const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const config = require('./utils/config');

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// IPC ハンドラ
ipcMain.handle('config:getAll', () => config.getAll());
ipcMain.handle('config:get', (_, key) => config.get(key));
ipcMain.handle('config:set', (_, key, value) => config.set(key, value));
ipcMain.handle('accounts:list', () => config.getAccounts());
ipcMain.handle('accounts:listActive', () => config.getActiveAccounts());
ipcMain.handle('accounts:get', (_, id) => config.getAccount(id));
ipcMain.handle('accounts:set', (_, id, data) => config.setAccount(id, data));

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
