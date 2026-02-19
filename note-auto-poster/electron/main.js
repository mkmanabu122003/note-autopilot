const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const sheetManager = require('./utils/sheet-manager');
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

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- Topics IPC ハンドラ ---
ipcMain.handle('topics:list', async (_, accountId) => sheetManager.readTopics(accountId));
ipcMain.handle('topics:listByStatus', async (_, accountId, status) => sheetManager.readTopicsByStatus(accountId, status));
ipcMain.handle('topics:updateStatus', async (_, accountId, topicId, status) => sheetManager.updateStatus(accountId, topicId, status));
ipcMain.handle('topics:add', async (_, accountId, topic) => sheetManager.addTopic(accountId, topic));
ipcMain.handle('topics:cache', (_, accountId) => sheetManager.readCache(accountId));

// --- Settings IPC ハンドラ ---
ipcMain.handle('settings:get', (_, key) => config.get(key));
ipcMain.handle('settings:set', (_, key, value) => config.set(key, value));
ipcMain.handle('settings:getAccount', (_, accountId) => config.getAccount(accountId));
ipcMain.handle('settings:setAccount', (_, accountId, data) => config.setAccount(accountId, data));

ipcMain.handle('settings:selectFile', async (_, options) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
    ...options,
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('settings:testConnection', async (_, accountId) => {
  try {
    const { google } = require('googleapis');
    const fs = require('fs');
    const keyPath = config.get('api.google_service_account_key_path');
    if (!keyPath || !fs.existsSync(keyPath)) {
      return { success: false, error: 'サービスアカウントキーファイルが見つかりません' };
    }
    const account = config.getAccount(accountId);
    if (!account?.sheets?.spreadsheet_id) {
      return { success: false, error: 'スプレッドシートIDが設定されていません' };
    }
    const auth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: account.sheets.spreadsheet_id,
      range: `${account.sheets.sheet_name || 'topics'}!A1:J1`,
    });
    const headers = res.data.values?.[0] || [];
    return { success: true, headers };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
