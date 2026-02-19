const defaultConfig = require('../utils/config');

/**
 * アカウントのCRUD操作を提供するサービス
 * @param {object} config - config モジュール（テスト時にモック注入可能）
 */
function createAccountManager(config) {
  return {
    listAccounts: () => config.getAccounts(),
    listActiveAccounts: () => config.getActiveAccounts(),
    getAccount: (id) => config.getAccount(id),
    setAccount: (id, data) => {
      config.setAccount(id, data);
      return config.getAccount(id);
    },
    deleteAccount: (id) => {
      const accounts = config.getAccounts();
      delete accounts[id];
      config.set('accounts', accounts);
    },
    toggleAccount: (id, enabled) => {
      const account = config.getAccount(id);
      if (account) {
        account.enabled = enabled;
        config.setAccount(id, account);
      }
      return config.getAccount(id);
    },
  };
}

const manager = createAccountManager(defaultConfig);
manager.createAccountManager = createAccountManager;

module.exports = manager;
