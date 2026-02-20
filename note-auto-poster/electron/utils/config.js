const path = require('path');

const DEFAULT_DATA_DIR = path.join(__dirname, '..', '..', 'data');

const schema = {
  api: {
    type: 'object',
    additionalProperties: true,
    properties: {
      anthropic_key: { type: 'string', default: '' },
      web_search_key: { type: 'string', default: '' },
      generation_model: { type: 'string', default: 'claude-sonnet-4-5-20250929' },
      scoring_model: { type: 'string', default: 'claude-haiku-4-5-20251001' },
      regeneration_model: { type: 'string', default: 'claude-sonnet-4-5-20250929' },
      google_service_account_key_path: { type: 'string', default: '' },
    },
    default: {},
  },
  google: {
    type: 'object',
    additionalProperties: true,
    properties: {
      key_file: { type: 'string', default: '' },
      client_email: { type: 'string', default: '' },
    },
    default: {},
  },
  accounts: {
    type: 'object',
    additionalProperties: true,
    default: {},
  },
  scoring: {
    type: 'object',
    additionalProperties: true,
    properties: {
      auto_approve_threshold: { type: 'number', default: 8 },
      auto_reject_threshold: { type: 'number', default: 4 },
    },
    default: {},
  },
  article: {
    type: 'object',
    additionalProperties: true,
    properties: {
      min_length: { type: 'number', default: 1500 },
      max_length: { type: 'number', default: 4000 },
      language: { type: 'string', default: 'ja' },
      writing_guidelines: { type: 'string', default: '' },
    },
    default: {},
  },
  app: {
    type: 'object',
    additionalProperties: true,
    properties: {
      language: { type: 'string', default: '日本語' },
      min_chars: { type: 'number', default: 1500 },
      max_chars: { type: 'number', default: 4000 },
    },
    default: {},
  },
  github: {
    type: 'object',
    additionalProperties: true,
    properties: {
      token: { type: 'string', default: '' },
      repository: { type: 'string', default: '' },
      enabled: { type: 'boolean', default: false },
    },
    default: {},
  },
};

let store = null;
let storePromise = null;

async function getStore() {
  if (store) return store;
  if (!storePromise) {
    storePromise = (async () => {
      const { default: Store } = await import('electron-store');
      store = new Store({
        schema,
        encryptionKey: 'note-auto-poster-v1',
        name: 'config',
      });
      return store;
    })();
  }
  return storePromise;
}

// Legacy loadConfig for backward compatibility with generator/sheets code
async function loadConfig() {
  const s = await getStore();
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
  getAll: async () => (await getStore()).store,
  get: async (key) => (await getStore()).get(key),
  set: async (key, value) => (await getStore()).set(key, value),
  getAccount: async (accountId) => (await getStore()).get(`accounts.${accountId}`),
  setAccount: async (accountId, data) => (await getStore()).set(`accounts.${accountId}`, data),
  getAccounts: async () => (await getStore()).get('accounts') || {},
  getActiveAccounts: async () => {
    const accounts = (await getStore()).get('accounts') || {};
    return Object.entries(accounts)
      .filter(([_, a]) => a.enabled)
      .map(([id, a]) => ({ id, ...a }));
  },
  _setStoreForTesting: (mockStore) => { store = mockStore; storePromise = null; },
};
