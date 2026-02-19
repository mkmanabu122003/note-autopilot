const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  config: {
    getAll: () => ipcRenderer.invoke('config:getAll'),
    get: (key) => ipcRenderer.invoke('config:get', key),
    set: (key, value) => ipcRenderer.invoke('config:set', key, value),
  },
  accounts: {
    list: () => ipcRenderer.invoke('accounts:list'),
    listActive: () => ipcRenderer.invoke('accounts:listActive'),
    get: (id) => ipcRenderer.invoke('accounts:get', id),
    set: (id, data) => ipcRenderer.invoke('accounts:set', id, data),
  },
  topics: {
    list: (accountId) => ipcRenderer.invoke('topics:list', accountId),
    listByStatus: (accountId, status) => ipcRenderer.invoke('topics:listByStatus', accountId, status),
    updateStatus: (accountId, topicId, status) => ipcRenderer.invoke('topics:updateStatus', accountId, topicId, status),
    add: (accountId, topic) => ipcRenderer.invoke('topics:add', accountId, topic),
    cache: (accountId) => ipcRenderer.invoke('topics:cache', accountId),
  },
  generator: {
    run: (accountId) => ipcRenderer.invoke('generator:run', accountId),
    status: (batchId) => ipcRenderer.invoke('generator:status', batchId),
  },
  articles: {
    list: (accountId) => ipcRenderer.invoke('articles:list', accountId),
    get: (accountId, articleId) => ipcRenderer.invoke('articles:get', accountId, articleId),
    update: (accountId, article) => ipcRenderer.invoke('articles:update', accountId, article),
  },
  dialog: {
    openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
  },
  sheets: {
    testConnection: (accountId) => ipcRenderer.invoke('sheets:testConnection', accountId),
  },
  google: {
    readKeyFile: (path) => ipcRenderer.invoke('google:readKeyFile', path),
  },
});
