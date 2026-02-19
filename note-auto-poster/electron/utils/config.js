const path = require('path');

const DEFAULTS = {
  accounts: {
    tokken: {
      platform: 'note',
      sheets: {
        spreadsheet_id: '',
        sheet_name: 'topics',
      },
    },
  },
  api: {
    google_service_account_key_path: '',
  },
};

/**
 * ドット区切りキーでオブジェクトから値を取得
 */
function deepGet(obj, key) {
  return key.split('.').reduce((o, k) => o?.[k], obj);
}

/**
 * ドット区切りキーでオブジェクトに値をセット
 */
function deepSet(obj, key, value) {
  const keys = key.split('.');
  const last = keys.pop();
  let target = obj;
  for (const k of keys) {
    if (target[k] === undefined || target[k] === null || typeof target[k] !== 'object') {
      target[k] = {};
    }
    target = target[k];
  }
  target[last] = value;
}

let store;

try {
  const ElectronStore = require('electron-store');
  const StoreClass = ElectronStore.default || ElectronStore;
  store = new StoreClass({
    name: 'note-auto-poster-config',
    defaults: DEFAULTS,
  });
} catch {
  // Electron外環境（テスト等）ではインメモリストアを使用
  const data = JSON.parse(JSON.stringify(DEFAULTS));
  store = {
    get(key) { return deepGet(data, key); },
    set(key, value) { deepSet(data, key, value); },
    get store() { return data; },
  };
}

module.exports = {
  /**
   * ドット区切りのキーで設定値を取得
   * @param {string} key - e.g. 'api.google_service_account_key_path'
   */
  get(key) {
    return store.get(key);
  },

  /**
   * ドット区切りのキーで設定値をセット
   * @param {string} key
   * @param {*} value
   */
  set(key, value) {
    store.set(key, value);
  },

  /**
   * アカウント情報を取得
   * @param {string} accountId
   */
  getAccount(accountId) {
    return store.get(`accounts.${accountId}`);
  },

  /**
   * アカウント情報を更新
   * @param {string} accountId
   * @param {object} data - マージするデータ
   */
  setAccount(accountId, data) {
    const current = store.get(`accounts.${accountId}`) || {};
    store.set(`accounts.${accountId}`, { ...current, ...data });
  },

  /**
   * 全設定を取得（デバッグ用）
   */
  getAll() {
    return store.store;
  },
};
