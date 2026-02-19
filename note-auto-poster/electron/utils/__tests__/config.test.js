import { describe, it, expect, beforeEach } from 'vitest';

// electron-store の MockStore
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

// config モジュールをインポートし、テスト用のモックストアを注入
const config = await import('../config.js');

beforeEach(() => {
  config._setStoreForTesting(new MockStore());
});

describe('config', () => {
  it('set/get で値が保存・取得できる', async () => {
    await config.set('api.anthropic_key', 'test-key-123');
    expect(await config.get('api.anthropic_key')).toBe('test-key-123');
  });

  it('setAccount/getAccount でアカウント設定が保存・取得できる', async () => {
    const accountData = {
      display_name: 'テスト',
      enabled: true,
      note: { email: 'test@example.com', password: 'pass' },
      revenue: { monthly_target: 300000 },
      pillars: [],
      privacy: { real_name: 'hidden' },
    };
    await config.setAccount('test-account', accountData);
    const result = await config.getAccount('test-account');
    expect(result.display_name).toBe('テスト');
    expect(result.enabled).toBe(true);
    expect(result.revenue.monthly_target).toBe(300000);
  });

  it('getActiveAccounts は enabled: true のアカウントのみ返す', async () => {
    await config.setAccount('active', { display_name: 'Active', enabled: true });
    await config.setAccount('inactive', { display_name: 'Inactive', enabled: false });
    const active = await config.getActiveAccounts();
    expect(active.some((a) => a.id === 'active')).toBe(true);
    expect(active.some((a) => a.id === 'inactive')).toBe(false);
  });
});
