import { describe, it, expect, beforeEach } from 'vitest';

// MockStore: electron-store 互換のインメモリストア
class MockStore {
  constructor() {
    this._data = {};
  }
  get store() {
    return { ...this._data };
  }
  get(key) {
    return key.split('.').reduce((obj, k) => obj?.[k], this._data);
  }
  set(key, value) {
    const keys = key.split('.');
    let obj = this._data;
    for (let i = 0; i < keys.length - 1; i++) {
      obj[keys[i]] = obj[keys[i]] || {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
  }
}

// config 互換のモックオブジェクトを作成
function createMockConfig() {
  const store = new MockStore();
  return {
    getAll: () => store.store,
    get: (key) => store.get(key),
    set: (key, value) => store.set(key, value),
    getAccount: (accountId) => store.get(`accounts.${accountId}`),
    setAccount: (accountId, data) => store.set(`accounts.${accountId}`, data),
    getAccounts: () => store.get('accounts') || {},
    getActiveAccounts: () => {
      const accounts = store.get('accounts') || {};
      return Object.entries(accounts)
        .filter(([_, a]) => a.enabled)
        .map(([id, a]) => ({ id, ...a }));
    },
  };
}

// createAccountManager を使いモック config を注入
const mod = await import('../account-manager.js');
const { createAccountManager } = mod;

let accountManager;

beforeEach(() => {
  accountManager = createAccountManager(createMockConfig());
});

describe('account-manager', () => {
  it('setAccount/getAccount でアカウントのCRUDができる', () => {
    const data = { display_name: 'テスト太郎', enabled: true, note: { email: 'a@b.com', password: 'pw' } };
    accountManager.setAccount('taro', data);
    const result = accountManager.getAccount('taro');
    expect(result.display_name).toBe('テスト太郎');
    expect(result.enabled).toBe(true);
  });

  it('listAccounts で全アカウント一覧を取得できる', () => {
    accountManager.setAccount('acc1', { display_name: 'Acc1', enabled: true });
    accountManager.setAccount('acc2', { display_name: 'Acc2', enabled: false });
    const accounts = accountManager.listAccounts();
    expect(accounts.acc1).toBeDefined();
    expect(accounts.acc2).toBeDefined();
  });

  it('listActiveAccounts は有効なアカウントのみ返す', () => {
    accountManager.setAccount('enabled1', { display_name: 'Enabled', enabled: true });
    accountManager.setAccount('disabled1', { display_name: 'Disabled', enabled: false });
    const active = accountManager.listActiveAccounts();
    expect(active.some((a) => a.id === 'enabled1')).toBe(true);
    expect(active.some((a) => a.id === 'disabled1')).toBe(false);
  });

  it('toggleAccount で有効/無効を切り替えられる', () => {
    accountManager.setAccount('toggle-test', { display_name: 'Toggle', enabled: true });
    accountManager.toggleAccount('toggle-test', false);
    const result = accountManager.getAccount('toggle-test');
    expect(result.enabled).toBe(false);
  });

  it('deleteAccount でアカウントを削除できる', () => {
    accountManager.setAccount('to-delete', { display_name: 'Delete Me', enabled: true });
    expect(accountManager.getAccount('to-delete')).toBeDefined();
    accountManager.deleteAccount('to-delete');
    expect(accountManager.getAccount('to-delete')).toBeUndefined();
  });
});
