const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const COLUMNS = ['id', 'theme', 'keywords', 'additional_instructions', 'pillar', 'is_paid', 'price', 'free_preview_ratio', 'status', 'updated_at'];
const DEFAULT_DATA_DIR = path.join(__dirname, '..', '..', 'data');

function rowToObject(row) {
  const obj = {};
  COLUMNS.forEach((col, i) => {
    let val = row[i] !== undefined ? row[i] : '';
    if (col === 'id') val = parseInt(val, 10) || 0;
    else if (col === 'is_paid') val = val === 'TRUE' || val === 'true' || val === true;
    else if (col === 'price') val = parseInt(val, 10) || 0;
    else if (col === 'free_preview_ratio') val = parseFloat(val) || 0;
    obj[col] = val;
  });
  if (!obj.status) obj.status = 'pending';
  return obj;
}

class SheetManager {
  async _getAuth() {
    const keyPath = await config.get('api.google_service_account_key_path');
    if (!keyPath || !fs.existsSync(keyPath)) {
      throw new Error('サービスアカウントキーファイルが見つかりません');
    }
    const auth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return auth;
  }

  async _getAccountSheets(accountId) {
    const account = await config.getAccount(accountId);
    if (!account) throw new Error(`アカウント "${accountId}" が見つかりません`);
    const spreadsheetId = account.sheets?.spreadsheet_id;
    const sheetName = account.sheets?.sheet_name || 'topics';
    if (!spreadsheetId) throw new Error('スプレッドシートIDが設定されていません');
    return { spreadsheetId, sheetName };
  }

  _getCachePath(accountId) {
    return path.join(DEFAULT_DATA_DIR, 'accounts', accountId, 'topics-cache.json');
  }

  _saveCache(accountId, topics) {
    const cachePath = this._getCachePath(accountId);
    const cacheDir = path.dirname(cachePath);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    const data = { topics, cached_at: new Date().toISOString() };
    fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  _loadCache(accountId) {
    const cachePath = this._getCachePath(accountId);
    if (!fs.existsSync(cachePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    } catch {
      return null;
    }
  }

  async readTopics(accountId) {
    try {
      const auth = await this._getAuth();
      const { spreadsheetId, sheetName } = await this._getAccountSheets(accountId);
      const sheets = google.sheets({ version: 'v4', auth });

      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A2:J`,
      });

      const rows = res.data.values || [];
      const topics = rows.map((row) => rowToObject(row)).filter((t) => t.id > 0);

      this._saveCache(accountId, topics);
      return topics;
    } catch (e) {
      // Fallback to cache
      const cache = this._loadCache(accountId);
      if (cache && cache.topics) {
        return cache.topics;
      }
      throw e;
    }
  }

  async updateTopicStatus(accountId, topicId, status) {
    const auth = await this._getAuth();
    const { spreadsheetId, sheetName } = await this._getAccountSheets(accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    // Find the row for this topic
    const topics = await this.readTopics(accountId);
    const topicIndex = topics.findIndex((t) => t.id === topicId);
    if (topicIndex === -1) throw new Error(`トピックID ${topicId} が見つかりません`);

    const rowIndex = topicIndex + 2; // +1 for header, +1 for 1-based index
    const now = new Date().toISOString();

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!I${rowIndex}:J${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[status, now]] },
    });

    return { success: true };
  }

  async addTopic(accountId, topic) {
    const auth = await this._getAuth();
    const { spreadsheetId, sheetName } = await this._getAccountSheets(accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    const now = new Date().toISOString();
    const row = [
      topic.id || '',
      topic.theme || '',
      topic.keywords || '',
      topic.additional_instructions || '',
      topic.pillar || '',
      topic.is_paid ? 'TRUE' : 'FALSE',
      topic.price || 0,
      topic.free_preview_ratio || 0,
      topic.status || 'pending',
      now,
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:J`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    });

    return { success: true };
  }

  async getCache(accountId) {
    return this._loadCache(accountId);
  }
}

module.exports = { SheetManager, COLUMNS, rowToObject };
