const config = require('../utils/config');
const logger = require('../utils/logger');
const frontmatter = require('../utils/frontmatter');
const fs = require('fs');
const path = require('path');
const { generateStructureMap, formatForTelegram } = require('./structure-map');
const { reviewSessionManager } = require('./review-session');
const { batchRewrite, formatSummaryForTelegram } = require('./batch-rewriter');

const TELEGRAPH_API = 'https://api.telegra.ph';
const TELEGRAM_API = 'https://api.telegram.org';

// --- Markdown conversion helpers ---

function parseInline(text) {
  const result = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      result.push({ tag: 'strong', children: [match[2]] });
    } else if (match[3]) {
      result.push({ tag: 'em', children: [match[3]] });
    } else if (match[4]) {
      result.push({ tag: 'code', children: [match[4]] });
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex));
  }
  return result.length > 0 ? result : [text];
}

function markdownToTelegraphNodes(markdown) {
  const lines = markdown.split('\n');
  const nodes = [];
  let currentList = null;

  for (const line of lines) {
    if (!line.trim()) {
      if (currentList) { nodes.push(currentList); currentList = null; }
      continue;
    }
    if (line.startsWith('# ')) {
      if (currentList) { nodes.push(currentList); currentList = null; }
      nodes.push({ tag: 'h3', children: parseInline(line.slice(2).trim()) });
      continue;
    }
    if (line.startsWith('## ')) {
      if (currentList) { nodes.push(currentList); currentList = null; }
      nodes.push({ tag: 'h4', children: parseInline(line.slice(3).trim()) });
      continue;
    }
    if (line.startsWith('### ') || line.startsWith('#### ')) {
      if (currentList) { nodes.push(currentList); currentList = null; }
      const text = line.replace(/^#+\s*/, '').trim();
      nodes.push({ tag: 'h4', children: parseInline(text) });
      continue;
    }
    if (line.includes('paid-line') || line.includes('ここから有料')) {
      if (currentList) { nodes.push(currentList); currentList = null; }
      nodes.push({ tag: 'hr' });
      nodes.push({ tag: 'p', children: [{ tag: 'strong', children: ['--- ✂️ ここから有料 ---'] }] });
      nodes.push({ tag: 'hr' });
      continue;
    }
    if (/^[-─━]{3,}/.test(line.trim())) {
      if (currentList) { nodes.push(currentList); currentList = null; }
      nodes.push({ tag: 'hr' });
      continue;
    }
    if (/^\s*[-*・] /.test(line)) {
      const text = line.replace(/^\s*[-*・] /, '').trim();
      if (!currentList || currentList.tag !== 'ul') {
        if (currentList) nodes.push(currentList);
        currentList = { tag: 'ul', children: [] };
      }
      currentList.children.push({ tag: 'li', children: parseInline(text) });
      continue;
    }
    if (/^\s*\d+[.)．] /.test(line)) {
      const text = line.replace(/^\s*\d+[.)．] /, '').trim();
      if (!currentList || currentList.tag !== 'ol') {
        if (currentList) nodes.push(currentList);
        currentList = { tag: 'ol', children: [] };
      }
      currentList.children.push({ tag: 'li', children: parseInline(text) });
      continue;
    }
    if (currentList) { nodes.push(currentList); currentList = null; }
    nodes.push({ tag: 'p', children: parseInline(line.trim()) });
  }
  if (currentList) nodes.push(currentList);
  return nodes;
}

function markdownToTelegramHtml(markdown) {
  return markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '\n<b>$1</b>')
    .replace(/^## (.+)$/gm, '\n<b>$1</b>')
    .replace(/^# (.+)$/gm, '\n<b>$1</b>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<i>$1</i>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/&lt;!-- paid-line --&gt;/g, '\n━━━━ ✂️ ここから有料 ━━━━\n');
}

function splitForTelegram(text, maxLen = 4096) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt === -1 || splitAt < maxLen / 2) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  return chunks;
}

// --- Data directory helpers ---

function getDataDir() {
  try {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'data');
  } catch {
    return path.join(__dirname, '..', '..', 'data');
  }
}

function getArticlesDir(accountId) {
  return path.join(getDataDir(), 'accounts', accountId, 'articles');
}

function getMappingPath(accountId) {
  return path.join(getDataDir(), 'accounts', accountId, 'telegram-mappings.json');
}

// --- Main service ---

class TelegramService {
  constructor() {
    this.polling = false;
    this.botToken = null;
    this.chatId = null;
    this.telegraphToken = null;
    this.offset = 0;
    this.mappings = {}; // accountId -> { filename -> mapping }
    this.topicIndex = {}; // topicId -> { accountId, filename }
    this._initPromise = null;
    this._eventHandlers = {};
  }

  on(event, handler) {
    if (!this._eventHandlers[event]) this._eventHandlers[event] = [];
    this._eventHandlers[event].push(handler);
  }

  _emit(event, ...args) {
    (this._eventHandlers[event] || []).forEach(h => h(...args));
  }

  async init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._doInit();
    return this._initPromise;
  }

  async _doInit() {
    this.botToken = await config.get('telegram.bot_token');
    this.chatId = await config.get('telegram.chat_id');
    this.telegraphToken = await config.get('telegram.telegraph_access_token');

    if (this.botToken && !this.telegraphToken) {
      await this.createTelegraphAccount();
    }

    // Load all account mappings
    await this._loadAllMappings();
  }

  async _loadAllMappings() {
    try {
      const accounts = await config.getAccounts();
      for (const accountId of Object.keys(accounts || {})) {
        await this._loadMapping(accountId);
      }
    } catch (e) {
      logger.error('telegram:loadMappings', e.message);
    }
  }

  async _loadMapping(accountId) {
    const mapPath = getMappingPath(accountId);
    try {
      if (fs.existsSync(mapPath)) {
        const data = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
        this.mappings[accountId] = data;
        for (const [filename, mapping] of Object.entries(data)) {
          if (mapping.topicId) {
            this.topicIndex[mapping.topicId] = { accountId, filename };
          }
        }
      }
    } catch (e) {
      logger.error('telegram:loadMapping', `${accountId}: ${e.message}`);
    }
  }

  _saveMapping(accountId, filename, mapping) {
    if (!this.mappings[accountId]) this.mappings[accountId] = {};
    this.mappings[accountId][filename] = mapping;
    if (mapping.topicId) {
      this.topicIndex[mapping.topicId] = { accountId, filename };
    }
    const mapPath = getMappingPath(accountId);
    const dir = path.dirname(mapPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(mapPath, JSON.stringify(this.mappings[accountId], null, 2), 'utf-8');
  }

  // --- Telegraph API ---

  async telegraphCall(method, params = {}) {
    const res = await fetch(`${TELEGRAPH_API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return res.json();
  }

  async createTelegraphAccount() {
    const result = await this.telegraphCall('createAccount', {
      short_name: 'note-autopilot',
      author_name: 'Note AutoPoster',
    });
    if (result.ok) {
      this.telegraphToken = result.result.access_token;
      await config.set('telegram.telegraph_access_token', this.telegraphToken);
    }
    return result;
  }

  async createTelegraphPage(title, nodes) {
    return this.telegraphCall('createPage', {
      access_token: this.telegraphToken,
      title,
      content: JSON.stringify(nodes),
      return_content: false,
    });
  }

  async editTelegraphPage(pagePath, title, nodes) {
    return this.telegraphCall(`editPage/${pagePath}`, {
      access_token: this.telegraphToken,
      title,
      content: JSON.stringify(nodes),
      return_content: false,
    });
  }

  // --- Telegram Bot API ---

  async botCall(method, params = {}) {
    if (!this.botToken) throw new Error('Bot Token が設定されていません');
    const res = await fetch(`${TELEGRAM_API}/bot${this.botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return res.json();
  }

  async getMe() {
    return this.botCall('getMe');
  }

  async createForumTopic(name) {
    return this.botCall('createForumTopic', {
      chat_id: this.chatId,
      name: name.substring(0, 128),
      icon_color: 7322096, // blue
    });
  }

  async sendMessage(text, options = {}) {
    return this.botCall('sendMessage', {
      chat_id: this.chatId,
      text,
      parse_mode: 'HTML',
      ...options,
    });
  }

  async editMessageText(messageId, text, options = {}) {
    return this.botCall('editMessageText', {
      chat_id: this.chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      ...options,
    });
  }

  async answerCallbackQuery(callbackQueryId, text) {
    return this.botCall('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
    });
  }

  // --- Test connection ---

  async testConnection() {
    await this.init();
    if (!this.botToken) return { success: false, error: 'Bot Token が未設定です' };

    const meResult = await this.getMe();
    if (!meResult.ok) {
      return { success: false, error: 'Bot Token が無効です: ' + (meResult.description || '') };
    }

    if (!this.chatId) {
      return { success: true, bot: meResult.result, needsChatId: true };
    }

    // Try sending a test action to verify chat access
    const chatResult = await this.botCall('getChat', { chat_id: this.chatId });
    if (!chatResult.ok) {
      return { success: false, error: 'Chat IDが無効です: ' + (chatResult.description || '') };
    }

    const isForumEnabled = chatResult.result.is_forum;
    return {
      success: true,
      bot: meResult.result,
      chat: chatResult.result,
      isForumEnabled,
    };
  }

  // --- Detect chat ID from recent updates ---

  async detectChatId() {
    if (!this.botToken) return { success: false, error: 'Bot Token が未設定です' };

    const result = await this.botCall('getUpdates', { limit: 10, timeout: 0 });
    if (!result.ok) return { success: false, error: result.description || '取得失敗' };

    // Find group/supergroup chats
    const chats = new Map();
    for (const update of result.result || []) {
      const msg = update.message || update.my_chat_member?.chat;
      if (msg?.chat && (msg.chat.type === 'supergroup' || msg.chat.type === 'group')) {
        chats.set(msg.chat.id, {
          id: msg.chat.id,
          title: msg.chat.title,
          type: msg.chat.type,
          is_forum: msg.chat.is_forum || false,
        });
      }
    }

    if (chats.size === 0) {
      return { success: false, error: 'グループが見つかりません。Botをグループに追加してメッセージを送信してください。' };
    }

    return { success: true, chats: Array.from(chats.values()) };
  }

  // --- Article workflow ---

  async sendArticleForReview(accountId, article) {
    await this.init();
    if (!this.botToken || !this.chatId) {
      return { success: false, error: 'Telegram が設定されていません' };
    }

    const title = article.title || '無題';
    const body = article.body || '';
    const filename = article.filename;

    // 1. Create Telegraph page
    const nodes = markdownToTelegraphNodes(body);
    let telegraphUrl = null;
    let telegraphPath = null;
    try {
      const tResult = await this.createTelegraphPage(title, nodes);
      if (tResult.ok) {
        telegraphUrl = `https://telegra.ph/${tResult.result.path}`;
        telegraphPath = tResult.result.path;
      } else {
        logger.error('telegram:telegraph', JSON.stringify(tResult));
      }
    } catch (e) {
      logger.error('telegram:telegraph', e.message);
    }

    // 2. Create Forum Topic
    const topicResult = await this.createForumTopic(title);
    if (!topicResult.ok) {
      logger.error('telegram:createTopic', JSON.stringify(topicResult));
      return { success: false, error: 'トピック作成失敗: ' + (topicResult.description || '') };
    }
    const topicId = topicResult.result.message_thread_id;

    // 3. Send Telegraph link (if available)
    if (telegraphUrl) {
      await this.sendMessage(
        `<a href="${telegraphUrl}">Telegraph で全文を読む</a>`,
        { message_thread_id: topicId, disable_web_page_preview: false }
      );
    }

    // 4. Send full article text
    const htmlText = markdownToTelegramHtml(body);
    const chunks = splitForTelegram(htmlText);
    const messageIds = [];
    for (const chunk of chunks) {
      try {
        const result = await this.sendMessage(chunk, { message_thread_id: topicId });
        if (result.ok) messageIds.push(result.result.message_id);
      } catch (e) {
        logger.error('telegram:sendChunk', e.message);
      }
    }

    // 5. Generate & send structure map (Phase 0)
    let structureMap = null;
    try {
      structureMap = await generateStructureMap(body);
      const mapText = formatForTelegram(title, structureMap);
      await this.sendMessage(mapText, { message_thread_id: topicId });
    } catch (e) {
      logger.error('telegram:structureMap', e.message);
      // 構造マップ失敗は非致命的 — 続行する
    }

    // 6. Create review session (Phase 1 ready)
    reviewSessionManager.create(accountId, filename, topicId, structureMap);

    // 7. Send action buttons
    let buttonMessageId = null;
    const cbPrefix = `${accountId}:${filename}`;
    const btnResult = await this.sendMessage('アクションを選択してください：', {
      message_thread_id: topicId,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ 承認', callback_data: `approve:${cbPrefix}` },
            { text: '❌ 却下', callback_data: `reject:${cbPrefix}` },
          ],
          [
            { text: '🔄 再生成', callback_data: `regen:${cbPrefix}` },
            { text: '📊 構造マップ', callback_data: `map:${cbPrefix}` },
          ],
        ],
      },
    });
    if (btnResult.ok) buttonMessageId = btnResult.result.message_id;

    // 8. Save mapping
    const mapping = {
      topicId,
      messageIds,
      buttonMessageId,
      telegraphPath,
      telegraphUrl,
      createdAt: new Date().toISOString(),
    };
    this._saveMapping(accountId, filename, mapping);

    logger.info('telegram:sent', `${title} → topic ${topicId}`);
    return { success: true, topicId, telegraphUrl };
  }

  // --- Polling ---

  async startPolling() {
    await this.init();
    if (!this.botToken) {
      logger.error('telegram:polling', 'Bot Token が未設定のためポーリング開始できません');
      return;
    }
    if (this.polling) return;
    this.polling = true;
    logger.info('telegram:polling', '開始');
    this._pollLoop();
  }

  stopPolling() {
    this.polling = false;
    logger.info('telegram:polling', '停止');
  }

  async _pollLoop() {
    while (this.polling) {
      try {
        const result = await this.botCall('getUpdates', {
          offset: this.offset,
          timeout: 30,
          allowed_updates: ['message', 'callback_query'],
        });
        if (result.ok && result.result.length > 0) {
          for (const update of result.result) {
            this.offset = update.update_id + 1;
            try {
              await this._handleUpdate(update);
            } catch (e) {
              logger.error('telegram:handleUpdate', e.message);
            }
          }
        }
      } catch (e) {
        logger.error('telegram:poll', e.message);
        if (this.polling) await new Promise(r => setTimeout(r, 5000));
      }
    }
  }

  async _handleUpdate(update) {
    if (update.callback_query) {
      await this._handleCallbackQuery(update.callback_query);
      return;
    }

    if (update.message && update.message.message_thread_id) {
      await this._handleTopicMessage(update.message);
    }
  }

  async _handleCallbackQuery(query) {
    const data = query.data || '';
    const parts = data.split(':');
    if (parts.length < 3) return;

    const [action, accountId, ...filenameParts] = parts;
    const filename = filenameParts.join(':');

    // パストラバーサル防止
    if (filename !== path.basename(filename)) {
      logger.error('telegram:callback', `Invalid filename rejected: ${filename}`);
      return;
    }

    if (action === 'approve') {
      await this._updateArticleStatus(accountId, filename, 'reviewed');
      await this.answerCallbackQuery(query.id, '✅ 承認しました');
      await this._sendStatusUpdate(accountId, filename, query.message, '✅ 承認済み');
    } else if (action === 'reject') {
      await this._updateArticleStatus(accountId, filename, 'rejected');
      await this.answerCallbackQuery(query.id, '❌ 却下しました');
      await this._sendStatusUpdate(accountId, filename, query.message, '❌ 却下済み');
    } else if (action === 'regen') {
      await this.answerCallbackQuery(query.id, '🔄 再生成を開始します...');
      await this._handleRegenerate(accountId, filename, query.message);
    } else if (action === 'map') {
      await this.answerCallbackQuery(query.id, '📊 構造マップを生成中...');
      await this._handleStructureMapRequest(accountId, filename, query.message);
    }
  }

  async _sendStatusUpdate(accountId, filename, originalMessage, statusText) {
    try {
      if (originalMessage) {
        await this.editMessageText(originalMessage.message_id, statusText, {
          message_thread_id: originalMessage.message_thread_id,
        });
      }
    } catch (e) {
      logger.error('telegram:statusUpdate', e.message);
    }
    this._emit('articleUpdated', accountId, filename);
  }

  async _updateArticleStatus(accountId, filename, status) {
    const dir = getArticlesDir(accountId);
    const filePath = path.join(dir, filename);
    if (!fs.existsSync(filePath)) return;

    // Read current content (don't modify)
    // Status is tracked externally via the articles:update IPC handler pattern
    // Emit event so the renderer can update
    this._emit('articleStatusChanged', accountId, filename, status);

    // Also push to GitHub if enabled
    try {
      const githubEnabled = await config.get('github.enabled');
      if (githubEnabled) {
        const { githubSync } = require('../utils/github-sync');
        const prMode = await config.get('github.pr_mode');
        if (prMode) {
          await githubSync.pushArticleToPR(accountId, filename, status);
        } else {
          await githubSync.pushArticle(accountId, filename, status);
        }
      }
    } catch (e) {
      logger.error('telegram:githubPush', e.message);
    }
  }

  async _handleTopicMessage(message) {
    const topicId = message.message_thread_id;
    const ref = this.topicIndex[topicId];
    if (!ref) return; // not a tracked topic

    const text = message.text || '';
    if (!text.trim()) return;

    // --- コマンド処理 ---

    if (text.startsWith('/approve') || text.startsWith('/承認')) {
      await this._updateArticleStatus(ref.accountId, ref.filename, 'reviewed');
      await this.sendMessage('✅ 承認しました', { message_thread_id: topicId });
      return;
    }

    if (text.startsWith('/reject') || text.startsWith('/却下')) {
      await this._updateArticleStatus(ref.accountId, ref.filename, 'rejected');
      await this.sendMessage('❌ 却下しました', { message_thread_id: topicId });
      return;
    }

    if (text.startsWith('/done')) {
      await this._handleDone(ref.accountId, ref.filename, topicId, text);
      return;
    }

    if (text.startsWith('/cancel') || text.startsWith('/キャンセル')) {
      await this._handleCancel(topicId);
      return;
    }

    if (text.startsWith('/undo') || text.startsWith('/取消')) {
      await this._handleUndo(topicId);
      return;
    }

    if (text.startsWith('/status') || text.startsWith('/状態')) {
      await this._handleSessionStatus(topicId);
      return;
    }

    if (text.startsWith('/retry')) {
      await this._handleRetry(ref.accountId, ref.filename, topicId, text);
      return;
    }

    if (text.startsWith('/map') || text.startsWith('/構造')) {
      await this._handleStructureMapRequest(ref.accountId, ref.filename, { message_thread_id: topicId });
      return;
    }

    if (text.startsWith('/edit')) {
      // 従来の即時編集モード（セッションを経由しない直接編集）
      const instruction = text.replace(/^\/edit\s*/, '').trim();
      if (instruction) {
        await this._handleEdit(ref.accountId, ref.filename, topicId, instruction);
      } else {
        await this.sendMessage('使い方: /edit [編集指示]', { message_thread_id: topicId });
      }
      return;
    }

    // --- レビューセッション: 指示蓄積 ---

    const session = reviewSessionManager.get(topicId);

    if (session && session.state === 'collecting') {
      // セッションが指示受付中 → 指示として蓄積
      try {
        const parsed = session.addInstruction(text);
        const count = session.instructions.length;
        await this.sendMessage(
          `📝 ${count}件目: ${escapeSessionHtml(parsed.display)}\n\n/done で一括実行 | /undo で取消 | /status で確認`,
          { message_thread_id: topicId }
        );
      } catch (e) {
        await this.sendMessage(`⚠️ ${e.message}`, { message_thread_id: topicId });
      }
      return;
    }

    if (session && session.state === 'done') {
      // 完了後のメッセージ → /retry として扱うか確認
      await this.sendMessage(
        'リライト済みです。追加修正するには:\n/retry S4 もう少し具体的に\n\n承認するには /approve',
        { message_thread_id: topicId }
      );
      return;
    }

    if (session && session.state === 'executing') {
      // 実行中はメッセージを受け付けない（並行編集によるデータ破壊防止）
      await this.sendMessage(
        '⏳ リライト実行中です。完了までお待ちください。',
        { message_thread_id: topicId }
      );
      return;
    }

    // セッションなし → 従来の即時編集にフォールバック
    await this._handleEdit(ref.accountId, ref.filename, topicId, text);
  }

  async _handleEdit(accountId, filename, topicId, editInstruction) {
    const dir = getArticlesDir(accountId);
    const filePath = path.join(dir, filename);
    if (!fs.existsSync(filePath)) {
      await this.sendMessage('記事ファイルが見つかりません', { message_thread_id: topicId });
      return;
    }

    await this.sendMessage('✏️ 編集を適用中...', { message_thread_id: topicId });

    try {
      const currentBody = fs.readFileSync(filePath, 'utf-8');
      const updatedBody = await this._applyEditWithClaude(currentBody, editInstruction);

      // Save updated article
      fs.writeFileSync(filePath, updatedBody, 'utf-8');

      // Update Telegraph page
      const mapping = (this.mappings[accountId] || {})[filename];
      if (mapping?.telegraphPath) {
        const title = (updatedBody.split('\n')[0] || '').replace(/^#+\s*/, '').trim() || '無題';
        const nodes = markdownToTelegraphNodes(updatedBody);
        await this.editTelegraphPage(mapping.telegraphPath, title, nodes);
      }

      // Send updated article
      const htmlText = markdownToTelegramHtml(updatedBody);
      const chunks = splitForTelegram(htmlText);
      for (const chunk of chunks) {
        await this.sendMessage(chunk, { message_thread_id: topicId });
      }

      // Re-send action buttons
      const cbPrefix = `${accountId}:${filename}`;
      await this.sendMessage('アクションを選択してください：', {
        message_thread_id: topicId,
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ 承認', callback_data: `approve:${cbPrefix}` },
            { text: '❌ 却下', callback_data: `reject:${cbPrefix}` },
            { text: '🔄 再生成', callback_data: `regen:${cbPrefix}` },
          ]],
        },
      });

      this._emit('articleUpdated', accountId, filename);
      logger.info('telegram:edit', `${filename} edited via Telegram`);
    } catch (e) {
      logger.error('telegram:edit', e.message);
      await this.sendMessage('編集に失敗しました: ' + e.message, { message_thread_id: topicId });
    }
  }

  async _applyEditWithClaude(articleBody, editInstruction) {
    const Anthropic = require('@anthropic-ai/sdk');
    const apiKey = await config.get('api.anthropic_key');
    if (!apiKey) throw new Error('Anthropic APIキーが設定されていません');

    const model = await config.get('telegram.edit_model') || 'claude-haiku-4-5-20251001';
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model,
      max_tokens: 8192,
      system: '記事の編集アシスタントです。ユーザーの修正指示に従って記事を編集し、修正後の記事全文のみを出力してください。余計な説明は不要です。',
      messages: [{
        role: 'user',
        content: `## 現在の記事\n${articleBody}\n\n## 修正指示\n${editInstruction}`,
      }],
    });

    return message.content[0].text;
  }

  async _handleRegenerate(accountId, filename, originalMessage) {
    const topicId = originalMessage?.message_thread_id;
    try {
      // Find the topic for this article from mappings
      const mapping = (this.mappings[accountId] || {})[filename];
      const threadId = topicId || mapping?.topicId;

      if (threadId) {
        await this.sendMessage('🔄 記事を再生成中...', { message_thread_id: threadId });
      }

      // Trigger regeneration via the generator
      this._emit('regenerateRequested', accountId, filename);
    } catch (e) {
      logger.error('telegram:regenerate', e.message);
    }
  }

  // --- Review Session Commands ---

  async _handleDone(accountId, filename, topicId, text) {
    const session = reviewSessionManager.get(topicId);
    if (!session) {
      await this.sendMessage('レビューセッションがありません。記事に指示を送信してください。', { message_thread_id: topicId });
      return;
    }

    if (session.instructions.length === 0) {
      await this.sendMessage('指示がありません。先にセクション指定で指示を追加してください。\n例: S4 具体例を追加', { message_thread_id: topicId });
      return;
    }

    // モデル指定のパース: /done opus, /done sonnet
    const modelArg = text.replace(/^\/done\s*/, '').trim().toLowerCase();
    const modelKey = ['opus', 'sonnet', 'haiku'].includes(modelArg) ? modelArg : null;

    try {
      session.startExecution(modelKey);

      const modelLabel = modelKey || 'sonnet';
      await this.sendMessage(
        `⏳ 一括リライト実行中...\n指示: ${session.instructions.length}件\nモデル: ${modelLabel}`,
        { message_thread_id: topicId }
      );

      // 記事を読み込む
      const dir = getArticlesDir(accountId);
      const filePath = path.join(dir, filename);
      if (!fs.existsSync(filePath)) {
        throw new Error('記事ファイルが見つかりません');
      }
      const articleContent = fs.readFileSync(filePath, 'utf-8');

      // バックアップを作成（リライト失敗時のデータ損失防止）
      const backupPath = filePath + '.bak';
      fs.writeFileSync(backupPath, articleContent, 'utf-8');

      // 一括リライト実行
      const result = await batchRewrite(articleContent, session.instructions, {
        model: modelKey,
      });

      // 記事を保存
      fs.writeFileSync(filePath, result.rewrittenContent, 'utf-8');

      // バックアップを削除（成功時のみ）
      try { fs.unlinkSync(backupPath); } catch (_) { /* ignore */ }

      // セッション完了
      session.completeExecution(result);

      // Telegraph ページを更新
      const mapping = (this.mappings[accountId] || {})[filename];
      if (mapping?.telegraphPath) {
        const { body: updatedBody } = frontmatter.parse(result.rewrittenContent);
        const title = frontmatter.extractTitle(updatedBody) || '無題';
        const nodes = markdownToTelegraphNodes(updatedBody);
        await this.editTelegraphPage(mapping.telegraphPath, title, nodes);
      }

      // 結果サマリーを送信（Telegraphリンク付き）
      const telegraphUrl = mapping?.telegraphPath
        ? `https://telegra.ph/${mapping.telegraphPath}`
        : null;
      const summaryText = formatSummaryForTelegram(result.summary, result.usage, telegraphUrl);
      await this.sendMessage(summaryText, { message_thread_id: topicId });

      // GitHub に push
      try {
        const githubEnabled = await config.get('github.enabled');
        if (githubEnabled) {
          const { githubSync } = require('../utils/github-sync');
          const prMode = await config.get('github.pr_mode');
          if (prMode) {
            await githubSync.pushArticleToPR(accountId, filename, 'reviewing');
          } else {
            await githubSync.pushArticle(accountId, filename, 'reviewing');
          }
        }
      } catch (e) {
        logger.error('telegram:batchRewrite:github', e.message);
      }

      this._emit('articleUpdated', accountId, filename);
      logger.info('telegram:batchRewrite', `${filename}: ${result.summary.instructionCount} edits applied`);
    } catch (e) {
      logger.error('telegram:batchRewrite', e.message);
      session.state = 'collecting'; // 失敗時は collecting に戻す
      await this.sendMessage(`❌ リライト失敗: ${e.message}`, { message_thread_id: topicId });
    }
  }

  async _handleCancel(topicId) {
    const session = reviewSessionManager.get(topicId);
    if (!session) {
      await this.sendMessage('レビューセッションがありません。', { message_thread_id: topicId });
      return;
    }

    const count = session.instructions.length;
    session.clearInstructions();
    await this.sendMessage(`🗑 ${count}件の指示をクリアしました。`, { message_thread_id: topicId });
  }

  async _handleUndo(topicId) {
    const session = reviewSessionManager.get(topicId);
    if (!session) {
      await this.sendMessage('レビューセッションがありません。', { message_thread_id: topicId });
      return;
    }

    const removed = session.undoLast();
    if (!removed) {
      await this.sendMessage('取り消す指示がありません。', { message_thread_id: topicId });
      return;
    }

    const remaining = session.instructions.length;
    await this.sendMessage(
      `↩️ 取消: ${escapeSessionHtml(removed.display)}\n残り: ${remaining}件`,
      { message_thread_id: topicId }
    );
  }

  async _handleSessionStatus(topicId) {
    const session = reviewSessionManager.get(topicId);
    if (!session) {
      await this.sendMessage('レビューセッションがありません。', { message_thread_id: topicId });
      return;
    }

    const summary = session.getSummary();
    const lines = [];
    lines.push(`<b>📋 セッション状態: ${summary.state}</b>`);
    lines.push(`指示: ${summary.instructionCount}件 | 履歴: ${summary.historyCount}回`);

    if (summary.instructions.length > 0) {
      lines.push('');
      lines.push('<b>蓄積中の指示:</b>');
      summary.instructions.forEach((inst, i) => {
        lines.push(`${i + 1}. ${escapeSessionHtml(inst)}`);
      });
    }

    lines.push('');
    lines.push('/done で実行 | /done opus で高品質実行');
    lines.push('/undo で最後の指示を取消');
    lines.push('/cancel で全指示クリア');

    await this.sendMessage(lines.join('\n'), { message_thread_id: topicId });
  }

  async _handleRetry(accountId, filename, topicId, text) {
    const session = reviewSessionManager.get(topicId);
    if (!session) {
      await this.sendMessage('レビューセッションがありません。', { message_thread_id: topicId });
      return;
    }

    // /retry の後に指示がある場合、それを追加して collecting に戻す
    session.retry();
    const instruction = text.replace(/^\/retry\s*/, '').trim();
    if (instruction) {
      const parsed = session.addInstruction(instruction);
      await this.sendMessage(
        `🔄 追加修正モード\n📝 1件目: ${escapeSessionHtml(parsed.display)}\n\n追加指示を送信するか、/done で実行`,
        { message_thread_id: topicId }
      );
    } else {
      await this.sendMessage(
        '🔄 追加修正モードに入りました。指示を送信してください。\n例: S6 もう少し具体的に',
        { message_thread_id: topicId }
      );
    }
  }

  async _handleStructureMapRequest(accountId, filename, message) {
    const topicId = message.message_thread_id;
    const dir = getArticlesDir(accountId);
    const filePath = path.join(dir, filename);

    if (!fs.existsSync(filePath)) {
      await this.sendMessage('記事ファイルが見つかりません', { message_thread_id: topicId });
      return;
    }

    try {
      await this.sendMessage('📊 構造マップを生成中...', { message_thread_id: topicId });
      const content = fs.readFileSync(filePath, 'utf-8');
      const { body } = frontmatter.parse(content);
      const title = frontmatter.extractTitle(body) || '無題';
      const structureMap = await generateStructureMap(body);

      // セッションの構造マップを更新
      const session = reviewSessionManager.get(topicId);
      if (session) {
        session.structureMap = structureMap;
      }

      const mapText = formatForTelegram(title, structureMap);
      await this.sendMessage(mapText, { message_thread_id: topicId });
    } catch (e) {
      logger.error('telegram:structureMapRequest', e.message);
      await this.sendMessage(`構造マップ生成に失敗: ${e.message}`, { message_thread_id: topicId });
    }
  }

  // --- Status ---

  getStatus() {
    return {
      polling: this.polling,
      configured: !!(this.botToken && this.chatId),
      botToken: this.botToken ? '***' + this.botToken.slice(-4) : null,
      chatId: this.chatId,
      telegraphToken: !!this.telegraphToken,
      trackedArticles: Object.values(this.mappings).reduce((sum, m) => sum + Object.keys(m).length, 0),
    };
  }

  // Reset cached init state (for re-init after config change)
  reset() {
    this._initPromise = null;
  }
}

function escapeSessionHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Singleton
const telegramService = new TelegramService();

module.exports = { telegramService, markdownToTelegraphNodes, markdownToTelegramHtml, splitForTelegram };
