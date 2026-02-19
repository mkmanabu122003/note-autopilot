const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

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

// IPC Handlers

ipcMain.handle('ping', () => 'pong');

ipcMain.handle('dialog:openFile', async (_, options) => {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win, options);
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('google:readKeyFile', async (_, filePath) => {
  try {
    const key = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return { success: true, client_email: key.client_email, project_id: key.project_id };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('sheets:testConnection', async (_, accountId) => {
  try {
    const { SheetManager } = require('./utils/csv-manager');
    const sheetManager = new SheetManager();
    const topics = await sheetManager.readTopics(accountId);
    return { success: true, count: topics.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Config handlers
ipcMain.handle('config:getAll', async () => {
  try {
    const { getConfig } = require('./utils/config');
    return await getConfig();
  } catch (e) {
    return {};
  }
});

ipcMain.handle('config:get', async (_, key) => {
  try {
    const { getConfigValue } = require('./utils/config');
    return await getConfigValue(key);
  } catch (e) {
    return null;
  }
});

ipcMain.handle('config:set', async (_, key, value) => {
  try {
    const { setConfigValue } = require('./utils/config');
    await setConfigValue(key, value);
  } catch (e) {
    throw new Error(e.message);
  }
});

// Account handlers
ipcMain.handle('accounts:list', async () => {
  try {
    const { AccountManager } = require('./services/account-manager');
    const am = new AccountManager();
    return await am.list();
  } catch (e) {
    return {};
  }
});

ipcMain.handle('accounts:listActive', async () => {
  try {
    const { AccountManager } = require('./services/account-manager');
    const am = new AccountManager();
    return await am.listActive();
  } catch (e) {
    return [];
  }
});

ipcMain.handle('accounts:get', async (_, id) => {
  try {
    const { AccountManager } = require('./services/account-manager');
    const am = new AccountManager();
    return await am.get(id);
  } catch (e) {
    return null;
  }
});

ipcMain.handle('accounts:set', async (_, id, data) => {
  try {
    const { AccountManager } = require('./services/account-manager');
    const am = new AccountManager();
    await am.set(id, data);
  } catch (e) {
    throw new Error(e.message);
  }
});

// Topic handlers
ipcMain.handle('topics:list', async (_, accountId) => {
  try {
    const { SheetManager } = require('./utils/csv-manager');
    const sm = new SheetManager();
    return await sm.readTopics(accountId);
  } catch (e) {
    return [];
  }
});

ipcMain.handle('topics:listByStatus', async (_, accountId, status) => {
  try {
    const { SheetManager } = require('./utils/csv-manager');
    const sm = new SheetManager();
    const topics = await sm.readTopics(accountId);
    return topics.filter(t => t.status === status);
  } catch (e) {
    return [];
  }
});

ipcMain.handle('topics:updateStatus', async (_, accountId, topicId, status) => {
  try {
    const { SheetManager } = require('./utils/csv-manager');
    const sm = new SheetManager();
    return await sm.updateTopicStatus(accountId, topicId, status);
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('topics:add', async (_, accountId, topic) => {
  try {
    const { SheetManager } = require('./utils/csv-manager');
    const sm = new SheetManager();
    return await sm.addTopic(accountId, topic);
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('topics:cache', async (_, accountId) => {
  try {
    const { SheetManager } = require('./utils/csv-manager');
    const sm = new SheetManager();
    return await sm.getCache(accountId);
  } catch (e) {
    return null;
  }
});

// Generator handlers
ipcMain.handle('generator:run', async (_, accountId) => {
  try {
    const { Generator } = require('./services/generator');
    const gen = new Generator();
    return await gen.run(accountId);
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('generator:status', async (_, batchId) => {
  try {
    const { Generator } = require('./services/generator');
    const gen = new Generator();
    return await gen.status(batchId);
  } catch (e) {
    return { status: 'error', error: e.message };
  }
});

// Article handlers
ipcMain.handle('articles:list', async (_, accountId) => {
  try {
    const { ArticleManager } = require('./services/account-manager');
    const am = new ArticleManager();
    return await am.list(accountId);
  } catch (e) {
    return [];
  }
});

ipcMain.handle('articles:get', async (_, accountId, articleId) => {
  try {
    const { ArticleManager } = require('./services/account-manager');
    const am = new ArticleManager();
    return await am.get(accountId, articleId);
  } catch (e) {
    return null;
  }
});

ipcMain.handle('articles:update', async (_, accountId, article) => {
  try {
    const { ArticleManager } = require('./services/account-manager');
    const am = new ArticleManager();
    return await am.update(accountId, article);
  } catch (e) {
    return { error: e.message };
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
