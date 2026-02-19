const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;

// 開発モードでもビルド版と同じ保存先を使う
if (isDev) {
  app.setName('note AutoPoster');
}

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

ipcMain.handle('sheets:testConnection', async (_, accountId, sheetsData) => {
  try {
    const config = require('./utils/config');
    const { google } = require('googleapis');
    const keyPath = await config.get('api.google_service_account_key_path');
    if (!keyPath || !fs.existsSync(keyPath)) {
      return { success: false, error: 'サービスアカウントキーファイルが見つかりません' };
    }
    const account = await config.getAccount(accountId);
    const spreadsheetId = sheetsData?.spreadsheet_id || account?.sheets?.spreadsheet_id;
    const sheetName = sheetsData?.sheet_name || account?.sheets?.sheet_name || 'topics';
    if (!spreadsheetId) {
      return { success: false, error: 'スプレッドシートIDが設定されていません' };
    }
    const auth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:J`,
    });
    const rows = res.data.values || [];
    const headers = rows[0] || [];
    const count = Math.max(0, rows.length - 1);
    return { success: true, headers, count };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Config handlers
ipcMain.handle('config:getAll', async () => {
  try {
    const config = require('./utils/config');
    return await config.getAll();
  } catch (e) {
    return {};
  }
});

ipcMain.handle('config:get', async (_, key) => {
  try {
    const config = require('./utils/config');
    return await config.get(key);
  } catch (e) {
    return null;
  }
});

ipcMain.handle('config:set', async (_, key, value) => {
  try {
    const config = require('./utils/config');
    await config.set(key, value);
  } catch (e) {
    throw new Error(e.message);
  }
});

// Account handlers
ipcMain.handle('accounts:list', async () => {
  try {
    const config = require('./utils/config');
    return await config.getAccounts();
  } catch (e) {
    return {};
  }
});

ipcMain.handle('accounts:listActive', async () => {
  try {
    const config = require('./utils/config');
    return await config.getActiveAccounts();
  } catch (e) {
    return [];
  }
});

ipcMain.handle('accounts:get', async (_, id) => {
  try {
    const config = require('./utils/config');
    return await config.getAccount(id);
  } catch (e) {
    return null;
  }
});

ipcMain.handle('accounts:set', async (_, id, data) => {
  try {
    const config = require('./utils/config');
    await config.setAccount(id, data);
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
    console.error('[topics:list] Error:', e.message);
    return { error: e.message, topics: [] };
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
    console.error('[generator:run] Error:', e.message);
    return { error: e.message };
  }
});

ipcMain.handle('generator:runSingle', async (_, accountId, topicId) => {
  try {
    const { Generator } = require('./services/generator');
    const gen = new Generator();
    return await gen.runSingle(accountId, topicId);
  } catch (e) {
    console.error('[generator:runSingle] Error:', e.message);
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

// Article handlers — read .md files from userData/data/accounts/{id}/articles/
function getArticlesDir(accountId) {
  try {
    return path.join(app.getPath('userData'), 'data', 'accounts', accountId, 'articles');
  } catch {
    return path.join(__dirname, '..', 'data', 'accounts', accountId, 'articles');
  }
}

ipcMain.handle('articles:list', async (_, accountId) => {
  try {
    const dir = getArticlesDir(accountId);
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort().reverse();
    return files.map((f) => {
      const content = fs.readFileSync(path.join(dir, f), 'utf-8');
      const lines = content.split('\n');
      const title = (lines[0] || '').replace(/^#+\s*/, '').trim() || f;
      return {
        id: f.replace('.md', ''),
        title,
        filename: f,
        status: 'generated',
        created_at: fs.statSync(path.join(dir, f)).birthtime.toISOString(),
      };
    });
  } catch (e) {
    console.error('[articles:list] Error:', e.message);
    return [];
  }
});

ipcMain.handle('articles:get', async (_, accountId, articleId) => {
  try {
    const dir = getArticlesDir(accountId);
    const filename = articleId.endsWith('.md') ? articleId : `${articleId}.md`;
    const filePath = path.join(dir, filename);
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const title = (lines[0] || '').replace(/^#+\s*/, '').trim();
    return {
      id: articleId,
      title,
      content,
      filename,
      status: 'generated',
      created_at: fs.statSync(filePath).birthtime.toISOString(),
    };
  } catch (e) {
    return null;
  }
});

ipcMain.handle('articles:update', async (_, accountId, article) => {
  try {
    const dir = getArticlesDir(accountId);
    const filename = article.filename || (article.id.endsWith('.md') ? article.id : `${article.id}.md`);
    const filePath = path.join(dir, filename);
    if (!fs.existsSync(filePath)) return { error: '記事ファイルが見つかりません' };
    fs.writeFileSync(filePath, article.content, 'utf-8');
    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
