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
    runSingle: (accountId, topicId, regenerateInstructions) => ipcRenderer.invoke('generator:runSingle', accountId, topicId, regenerateInstructions),
    status: (batchId) => ipcRenderer.invoke('generator:status', batchId),
    getSystemPrompt: () => ipcRenderer.invoke('generator:getSystemPrompt'),
  },
  articles: {
    list: (accountId) => ipcRenderer.invoke('articles:list', accountId),
    get: (accountId, articleId) => ipcRenderer.invoke('articles:get', accountId, articleId),
    update: (accountId, article) => ipcRenderer.invoke('articles:update', accountId, article),
    delete: (accountId, articleId) => ipcRenderer.invoke('articles:delete', accountId, articleId),
  },
  dialog: {
    openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
  },
  sheets: {
    testConnection: (accountId, sheetsData) => ipcRenderer.invoke('sheets:testConnection', accountId, sheetsData),
  },
  google: {
    readKeyFile: (path) => ipcRenderer.invoke('google:readKeyFile', path),
  },
  github: {
    testConnection: () => ipcRenderer.invoke('github:testConnection'),
    sync: (accountId) => ipcRenderer.invoke('github:sync', accountId),
    syncWithPR: (accountId) => ipcRenderer.invoke('github:syncWithPR', accountId),
    pushArticle: (accountId, filename, status, metadata) => ipcRenderer.invoke('github:pushArticle', accountId, filename, status, metadata),
    pushArticleToPR: (accountId, filename, status, metadata) => ipcRenderer.invoke('github:pushArticleToPR', accountId, filename, status, metadata),
    pull: (accountId) => ipcRenderer.invoke('github:pull', accountId),
    pullWithConflictResolution: (accountId) => ipcRenderer.invoke('github:pullWithConflictResolution', accountId),
    setupWorkflow: () => ipcRenderer.invoke('github:setupWorkflow'),
    status: () => ipcRenderer.invoke('github:status'),
  },
  telegram: {
    testConnection: () => ipcRenderer.invoke('telegram:testConnection'),
    detectChatId: () => ipcRenderer.invoke('telegram:detectChatId'),
    startPolling: () => ipcRenderer.invoke('telegram:startPolling'),
    stopPolling: () => ipcRenderer.invoke('telegram:stopPolling'),
    status: () => ipcRenderer.invoke('telegram:status'),
    sendArticle: (accountId, article) => ipcRenderer.invoke('telegram:sendArticle', accountId, article),
    onArticleStatusChanged: (callback) => {
      ipcRenderer.on('telegram:articleStatusChanged', (_, accountId, filename, status) => callback(accountId, filename, status));
    },
    onArticleUpdated: (callback) => {
      ipcRenderer.on('telegram:articleUpdated', (_, accountId, filename) => callback(accountId, filename));
    },
  },
  logs: {
    get: (opts) => ipcRenderer.invoke('logs:get', opts),
    cleanup: (days) => ipcRenderer.invoke('logs:cleanup', days),
  },
  thumbnails: {
    generate: (accountId, article) => ipcRenderer.invoke('thumbnails:generate', accountId, article),
    list: (accountId, articleId) => ipcRenderer.invoke('thumbnails:list', accountId, articleId),
    select: (accountId, articleId, pattern) => ipcRenderer.invoke('thumbnails:select', accountId, articleId, pattern),
    readAsBase64: (filePath) => ipcRenderer.invoke('thumbnails:readAsBase64', filePath),
  },
});
