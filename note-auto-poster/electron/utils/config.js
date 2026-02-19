const StoreModule = require('electron-store');
const Store = StoreModule.default || StoreModule;
const path = require('path');

const DEFAULT_DATA_DIR = path.join(__dirname, '..', '..', 'data');

const schema = {
  api: {
    type: 'object',
    properties: {
      anthropic_key: { type: 'string', default: '' },
      web_search_key: { type: 'string', default: '' },
      generation_model: { type: 'string', default: 'claude-opus-4-6-20260205' },
      scoring_model: { type: 'string', default: 'claude-haiku-4-5-20251001' },
      regeneration_model: { type: 'string', default: 'claude-opus-4-6-20260205' },
      google_service_account_key_path: { type: 'string', default: '' },
    },
    default: {},
  },
  accounts: {
    type: 'object',
    default: {},
  },
  scoring: {
    type: 'object',
    properties: {
      auto_approve_threshold: { type: 'number', default: 8 },
      auto_reject_threshold: { type: 'number', default: 4 },
    },
    default: {},
  },
  article: {
    type: 'object',
    properties: {
      min_length: { type: 'number', default: 1500 },
      max_length: { type: 'number', default: 4000 },
      language: { type: 'string', default: 'ja' },
    },
    default: {},
  },
};

let store = null;

function getStore() {
  if (!store) {
    store = new Store({
      schema,
      encryptionKey: 'note-auto-poster-v1',
      name: 'config',
    });
  }
  return store;
}

// Legacy loadConfig for backward compatibility with generator/sheets code
function loadConfig() {
  const s = getStore();
  const api = s.get('api') || {};
  return {
    anthropicApiKey: api.anthropic_key || process.env.ANTHROPIC_API_KEY || '',
    sheets: {
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || '',
      sheetName: process.env.GOOGLE_SHEET_NAME || 'topics',
      credentialsPath: api.google_service_account_key_path || process.env.GOOGLE_CREDENTIALS_PATH || '',
    },
    dataDir: process.env.DATA_DIR || DEFAULT_DATA_DIR,
  };
}

module.exports = {
  loadConfig,
  getAll: () => getStore().store,
  get: (key) => getStore().get(key),
  set: (key, value) => getStore().set(key, value),
  getAccount: (accountId) => getStore().get(`accounts.${accountId}`),
  setAccount: (accountId, data) => getStore().set(`accounts.${accountId}`, data),
  getAccounts: () => getStore().get('accounts') || {},
  getActiveAccounts: () => {
    const accounts = getStore().get('accounts') || {};
    return Object.entries(accounts)
      .filter(([_, a]) => a.enabled)
      .map(([id, a]) => ({ id, ...a }));
  },
  _setStoreForTesting: (mockStore) => { store = mockStore; },
};
