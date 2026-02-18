const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 以降のチケットで順次メソッドを追加
  ping: () => ipcRenderer.invoke('ping'),
});
