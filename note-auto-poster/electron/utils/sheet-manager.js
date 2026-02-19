const fs = require('fs');
const path = require('path');

// テスト環境でも動作するよう、依存モジュールを差し替え可能にする
let _google = require('googleapis').google;
let _config = require('./config');
let _logger = require('./logger');

const CACHE_DIR = (accountId) =>
  path.join(__dirname, '../../data/accounts', accountId);

const COLUMNS = ['id', 'theme', 'keywords', 'additional_instructions', 'pillar', 'is_paid', 'price', 'free_preview_ratio', 'status', 'updated_at'];

/**
 * Google Sheets APIクライアントを取得
 */
function getClient() {
  const keyPath = _config.get('api.google_service_account_key_path');
  if (!keyPath || !fs.existsSync(keyPath)) {
    throw new Error('Google Service Account key file not found. Set it in Settings.');
  }
  const auth = new _google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return _google.sheets({ version: 'v4', auth });
}

/**
 * シートIDとシート名を取得
 */
function getSheetInfo(accountId) {
  const account = _config.getAccount(accountId);
  if (!account?.sheets?.spreadsheet_id) {
    throw new Error(`Spreadsheet ID not configured for account: ${accountId}`);
  }
  return {
    spreadsheetId: account.sheets.spreadsheet_id,
    sheetName: account.sheets.sheet_name || 'topics',
  };
}

/**
 * 行データ（配列）をオブジェクトに変換
 */
function rowToObject(row) {
  const obj = {};
  COLUMNS.forEach((col, i) => {
    let val = row[i] ?? '';
    if (col === 'id' || col === 'price') val = parseInt(val, 10) || 0;
    else if (col === 'free_preview_ratio') val = parseFloat(val) || 0;
    else if (col === 'is_paid') val = String(val).toUpperCase() === 'TRUE';
    else val = String(val);
    obj[col] = val;
  });
  return obj;
}

/**
 * オブジェクトを行データ（配列）に変換
 */
function objectToRow(obj) {
  return COLUMNS.map((col) => {
    const val = obj[col];
    if (col === 'is_paid') return val ? 'TRUE' : 'FALSE';
    return val ?? '';
  });
}

/**
 * ローカルキャッシュの読み書き
 */
function readCache(accountId) {
  const cachePath = path.join(CACHE_DIR(accountId), 'topics-cache.json');
  if (!fs.existsSync(cachePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  } catch {
    return null;
  }
}

function writeCache(accountId, topics) {
  const dir = CACHE_DIR(accountId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const cachePath = path.join(dir, 'topics-cache.json');
  fs.writeFileSync(cachePath, JSON.stringify({
    topics,
    cached_at: new Date().toISOString(),
  }, null, 2));
}

module.exports = {
  /**
   * 全行を取得（Sheetsから読み取り → キャッシュ更新）
   * オフライン時はキャッシュを返す
   */
  async readTopics(accountId) {
    try {
      const sheets = getClient();
      const { spreadsheetId, sheetName } = getSheetInfo(accountId);

      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A2:J`,
      });

      const rows = res.data.values || [];
      const topics = rows.map(rowToObject).filter((t) => t.id > 0);

      writeCache(accountId, topics);
      _logger.info('sheet-manager', `Fetched ${topics.length} topics from Sheets`, { accountId });

      return topics;
    } catch (error) {
      _logger.warn('sheet-manager', `Sheets fetch failed, using cache: ${error.message}`, { accountId });
      const cache = readCache(accountId);
      if (cache) return cache.topics;
      throw error;
    }
  },

  /**
   * 特定ステータスの行を取得
   */
  async readTopicsByStatus(accountId, status) {
    const topics = await this.readTopics(accountId);
    return topics.filter((t) => t.status === status);
  },

  /**
   * ステータスを更新（id指定 → シートの該当行を書き換え）
   */
  async updateStatus(accountId, topicId, newStatus) {
    const sheets = getClient();
    const { spreadsheetId, sheetName } = getSheetInfo(accountId);

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A2:J`,
    });
    const rows = res.data.values || [];
    const rowIndex = rows.findIndex((row) => parseInt(row[0], 10) === topicId);
    if (rowIndex === -1) throw new Error(`Topic ${topicId} not found`);

    const sheetRow = rowIndex + 2;
    const now = new Date().toISOString();

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!I${sheetRow}:J${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[newStatus, now]],
      },
    });

    _logger.info('sheet-manager', `Updated topic ${topicId} to ${newStatus}`, { accountId });

    const cache = readCache(accountId);
    if (cache) {
      const topic = cache.topics.find((t) => t.id === topicId);
      if (topic) {
        topic.status = newStatus;
        topic.updated_at = now;
        writeCache(accountId, cache.topics);
      }
    }

    return { id: topicId, status: newStatus, updated_at: now };
  },

  /**
   * 新しい行をシートに追加
   */
  async addTopic(accountId, topic) {
    const sheets = getClient();
    const { spreadsheetId, sheetName } = getSheetInfo(accountId);

    const existingTopics = await this.readTopics(accountId);
    const maxId = existingTopics.reduce((max, t) => Math.max(max, t.id), 0);

    const newTopic = {
      id: maxId + 1,
      theme: topic.theme || '',
      keywords: topic.keywords || '',
      additional_instructions: topic.additional_instructions || '',
      pillar: topic.pillar || '',
      is_paid: topic.is_paid || false,
      price: topic.price || 0,
      free_preview_ratio: topic.free_preview_ratio || 0,
      status: 'pending',
      updated_at: new Date().toISOString(),
    };

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:J`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [objectToRow(newTopic)],
      },
    });

    _logger.info('sheet-manager', `Added topic ${newTopic.id}: ${newTopic.theme}`, { accountId });

    const cache = readCache(accountId);
    if (cache) {
      cache.topics.push(newTopic);
      writeCache(accountId, cache.topics);
    }

    return newTopic;
  },

  /**
   * ローカルキャッシュを直接読む（UI表示のフォールバック用）
   */
  readCache(accountId) {
    return readCache(accountId);
  },

  // テスト用エクスポート
  _internal: { rowToObject, objectToRow, COLUMNS },

  /**
   * テスト用: 依存モジュールを差し替える
   */
  _setTestDeps({ config, logger, google } = {}) {
    if (config) _config = config;
    if (logger) _logger = logger;
    if (google) _google = google;
  },
};
