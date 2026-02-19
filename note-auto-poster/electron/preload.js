const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 以降のチケットで順次メソッドを追加
  ping: () => ipcRenderer.invoke('ping'),

  // Topics API（Google Sheets テーマ管理）
  topics: {
    list: (accountId) => ipcRenderer.invoke('topics:list', accountId),
    listByStatus: (accountId, status) => ipcRenderer.invoke('topics:listByStatus', accountId, status),
    updateStatus: (accountId, topicId, status) => ipcRenderer.invoke('topics:updateStatus', accountId, topicId, status),
    add: (accountId, topic) => ipcRenderer.invoke('topics:add', accountId, topic),
    cache: (accountId) => ipcRenderer.invoke('topics:cache', accountId),
  },

  // Settings API
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    getAccount: (accountId) => ipcRenderer.invoke('settings:getAccount', accountId),
    setAccount: (accountId, data) => ipcRenderer.invoke('settings:setAccount', accountId, data),
    selectFile: (options) => ipcRenderer.invoke('settings:selectFile', options),
    testConnection: (accountId) => ipcRenderer.invoke('settings:testConnection', accountId),
  },
});
