const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 以降のチケットで順次メソッドを追加
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
});
