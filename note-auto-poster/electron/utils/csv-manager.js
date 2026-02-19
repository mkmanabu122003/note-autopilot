const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const config = require('./config');

function getDataDir() {
  try {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'data');
  } catch {
    // Fallback for testing or when app is not ready
    return path.join(__dirname, '..', '..', 'data');
  }
}

// Map common header variations to normalized field names
const HEADER_ALIASES = {
  id: 'id',
  theme: 'theme',
  テーマ: 'theme',
  topic: 'theme',
  keywords: 'keywords',
  キーワード: 'keywords',
  additional_instructions: 'additional_instructions',
  追加指示: 'additional_instructions',
  pillar: 'pillar',
  コンテンツ柱: 'pillar',
  is_paid: 'is_paid',
  有料: 'is_paid',
  price: 'price',
  価格: 'price',
  free_preview_ratio: 'free_preview_ratio',
  無料プレビュー率: 'free_preview_ratio',
  status: 'status',
  ステータス: 'status',
  updated_at: 'updated_at',
  更新日: 'updated_at',
};

function normalizeHeader(header) {
  const trimmed = (header || '').trim().toLowerCase();
  return HEADER_ALIASES[trimmed] || HEADER_ALIASES[header?.trim()] || trimmed;
}

function rowToObject(row, headerMap, rowIndex) {
  const obj = { id: rowIndex };

  for (const [colIndex, fieldName] of Object.entries(headerMap)) {
    const val = row[colIndex] !== undefined ? row[colIndex] : '';
    switch (fieldName) {
      case 'id': {
        const num = parseInt(val, 10);
        if (num > 0) obj.id = num;
        break;
      }
      case 'is_paid':
        obj.is_paid = val === 'TRUE' || val === 'true' || val === true || val === '1';
        break;
      case 'price':
        obj.price = parseInt(val, 10) || 0;
        break;
      case 'free_preview_ratio':
        obj.free_preview_ratio = parseFloat(val) || 0;
        break;
      default:
        obj[fieldName] = val;
    }
  }

  if (!obj.status) obj.status = 'pending';
  if (!obj.theme) obj.theme = '';
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
    return path.join(getDataDir(), 'accounts', accountId, 'topics-cache.json');
  }

  _saveCache(accountId, topics) {
    try {
      const cachePath = this._getCachePath(accountId);
      const cacheDir = path.dirname(cachePath);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      const data = { topics, cached_at: new Date().toISOString() };
      fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error('[SheetManager] Cache save failed:', e.message);
    }
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
        range: `${sheetName}!A1:J`,
      });

      const rows = res.data.values || [];
      if (rows.length <= 1) return [];

      // Build header mapping: colIndex -> normalized field name
      const headerRow = rows[0];
      const headerMap = {};
      headerRow.forEach((h, i) => {
        const normalized = normalizeHeader(h);
        if (normalized) headerMap[i] = normalized;
      });

      const dataRows = rows.slice(1);
      const topics = dataRows.map((row, idx) => rowToObject(row, headerMap, idx + 1));

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

    // Read fresh to find the correct row
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:J`,
    });
    const rows = res.data.values || [];
    if (rows.length <= 1) throw new Error('シートにデータがありません');

    const headerRow = rows[0];
    const statusCol = headerRow.findIndex((h) => normalizeHeader(h) === 'status');
    const updatedCol = headerRow.findIndex((h) => normalizeHeader(h) === 'updated_at');

    // Find the topic row by matching id or by index
    const dataRows = rows.slice(1);
    const headerMap = {};
    headerRow.forEach((h, i) => {
      const normalized = normalizeHeader(h);
      if (normalized) headerMap[i] = normalized;
    });

    let targetRowIndex = -1;
    for (let i = 0; i < dataRows.length; i++) {
      const topic = rowToObject(dataRows[i], headerMap, i + 1);
      if (topic.id === topicId) {
        targetRowIndex = i + 2; // 1-based, skip header
        break;
      }
    }
    if (targetRowIndex === -1) throw new Error(`トピックID ${topicId} が見つかりません`);

    const now = new Date().toISOString();

    if (statusCol >= 0) {
      const colLetter = String.fromCharCode(65 + statusCol);
      const range = updatedCol >= 0
        ? `${sheetName}!${colLetter}${targetRowIndex}:${String.fromCharCode(65 + updatedCol)}${targetRowIndex}`
        : `${sheetName}!${colLetter}${targetRowIndex}`;
      const values = updatedCol >= 0 ? [[status, now]] : [[status]];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: { values },
      });
    }

    return { success: true };
  }

  async addTopic(accountId, topic) {
    const auth = await this._getAuth();
    const { spreadsheetId, sheetName } = await this._getAccountSheets(accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    // Read headers to match column order
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!1:1`,
    });
    const headerRow = (res.data.values && res.data.values[0]) || [];

    const row = headerRow.map((h) => {
      const field = normalizeHeader(h);
      switch (field) {
        case 'is_paid': return topic.is_paid ? 'TRUE' : 'FALSE';
        case 'price': return topic.price || 0;
        case 'free_preview_ratio': return topic.free_preview_ratio || 0;
        case 'updated_at': return new Date().toISOString();
        default: return topic[field] || '';
      }
    });

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

module.exports = { SheetManager, HEADER_ALIASES, normalizeHeader, rowToObject };
