import { useState, useEffect } from 'react';
import { useToast } from '../../hooks/useToast';

export default function TelegramSection({ config, onConfigChange }) {
  const { showToast } = useToast();
  const [botToken, setBotToken] = useState(config?.telegram?.bot_token || '');
  const [chatId, setChatId] = useState(config?.telegram?.chat_id || '');
  const [enabled, setEnabled] = useState(config?.telegram?.enabled || false);
  const [editModel, setEditModel] = useState(config?.telegram?.edit_model || 'claude-haiku-4-5-20251001');
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectedChats, setDetectedChats] = useState(null);
  const [pollingStatus, setPollingStatus] = useState(null);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const status = await window.electronAPI.telegram.status();
      setPollingStatus(status);
    } catch {
      // ignore
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const api = window.electronAPI;
      await api.config.set('telegram.bot_token', botToken);
      await api.config.set('telegram.chat_id', chatId);
      await api.config.set('telegram.enabled', enabled);
      await api.config.set('telegram.edit_model', editModel);
      showToast('Telegram設定を保存しました', 'success');
      onConfigChange?.();

      // Start/stop polling based on enabled state
      if (enabled && botToken && chatId) {
        await api.telegram.startPolling();
      } else {
        await api.telegram.stopPolling();
      }
      await loadStatus();
    } catch (e) {
      showToast('保存に失敗しました: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!botToken) {
      showToast('Bot Tokenを入力してください', 'error');
      return;
    }
    setTesting(true);
    try {
      const api = window.electronAPI;
      await api.config.set('telegram.bot_token', botToken);
      if (chatId) await api.config.set('telegram.chat_id', chatId);
      const result = await api.telegram.testConnection();
      if (result.success) {
        let msg = `Bot: @${result.bot.username}`;
        if (result.chat) {
          msg += ` | グループ: ${result.chat.title}`;
          if (!result.isForumEnabled) {
            msg += ' (トピック機能が無効です。グループ設定でTopicsを有効にしてください)';
          }
        }
        if (result.needsChatId) {
          msg += ' | Chat IDを設定してください';
        }
        showToast(msg, result.needsChatId ? 'info' : 'success');
      } else {
        showToast('接続失敗: ' + (result.error || ''), 'error');
      }
    } catch (e) {
      showToast('テストに失敗しました: ' + e.message, 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleDetectChatId = async () => {
    if (!botToken) {
      showToast('先にBot Tokenを設定してください', 'error');
      return;
    }
    setDetecting(true);
    setDetectedChats(null);
    try {
      const api = window.electronAPI;
      await api.config.set('telegram.bot_token', botToken);
      const result = await api.telegram.detectChatId();
      if (result.success) {
        setDetectedChats(result.chats);
        if (result.chats.length === 1) {
          setChatId(String(result.chats[0].id));
          showToast(`グループ「${result.chats[0].title}」を検出しました`, 'success');
        }
      } else {
        showToast(result.error || '検出失敗', 'error');
      }
    } catch (e) {
      showToast('検出に失敗しました: ' + e.message, 'error');
    } finally {
      setDetecting(false);
    }
  };

  const selectChat = (chat) => {
    setChatId(String(chat.id));
    setDetectedChats(null);
    showToast(`「${chat.title}」を選択しました`, 'success');
  };

  return (
    <section>
      <h2 className="text-base font-bold text-gray-800 mb-3">Telegram連携</h2>
      <div className="bg-white border border-gray-200 rounded p-4 space-y-3">
        <p className="text-xs text-gray-500 mb-2">
          記事をTelegramのフォーラムトピックに送信し、スマホから確認・編集・承認できます。
          Telegraphで全文閲覧、Botで編集指示が可能です。すべて無料です。
        </p>

        {pollingStatus?.polling && (
          <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            ポーリング中 | 追跡記事: {pollingStatus.trackedArticles}件
          </div>
        )}

        <div className="flex items-center gap-2">
          <label className="w-40 text-sm text-gray-600 shrink-0">Bot Token</label>
          <input
            type={showToken ? 'text' : 'password'}
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder="123456:ABC-DEF..."
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm font-mono"
          />
          <button
            type="button"
            onClick={() => setShowToken(!showToken)}
            className="px-2 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100"
            title={showToken ? '非表示' : '表示'}
          >
            {showToken ? '\uD83D\uDC41' : '\uD83D\uDC41\u200D\uD83D\uDDE8'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <label className="w-40 text-sm text-gray-600 shrink-0">Chat ID</label>
          <input
            type="text"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="-100xxxxxxxxxx"
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm font-mono"
          />
          <button
            type="button"
            onClick={handleDetectChatId}
            disabled={detecting || !botToken}
            className="px-2 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 whitespace-nowrap"
          >
            {detecting ? '検出中...' : '自動検出'}
          </button>
        </div>

        {detectedChats && detectedChats.length > 1 && (
          <div className="ml-40 pl-2 space-y-1">
            <p className="text-xs text-gray-500">グループを選択してください：</p>
            {detectedChats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => selectChat(chat)}
                className="block text-sm text-blue-600 hover:text-blue-800 hover:underline"
              >
                {chat.title} ({chat.id}) {chat.is_forum ? '(Topics有効)' : ''}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <label className="w-40 text-sm text-gray-600 shrink-0">自動送信</label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-700">記事生成後にTelegramへ自動送信</span>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <label className="w-40 text-sm text-gray-600 shrink-0">編集モデル</label>
          <select
            value={editModel}
            onChange={(e) => setEditModel(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          >
            <option value="claude-haiku-4-5-20251001">Haiku (低コスト)</option>
            <option value="claude-sonnet-4-5-20250929">Sonnet (高品質)</option>
          </select>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={handleTest}
            disabled={testing || !botToken}
            className="px-3 py-1 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {testing ? 'テスト中...' : '接続テスト'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>

        {/* Setup instructions */}
        {!botToken && (
          <div className="pt-3 border-t border-gray-200 space-y-1">
            <h3 className="text-sm font-bold text-gray-700">セットアップ手順</h3>
            <ol className="text-xs text-gray-500 list-decimal list-inside space-y-0.5">
              <li>@BotFather でBotを作成し、Bot Tokenを取得</li>
              <li>Telegramでスーパーグループを作成し、Topics（トピック）を有効化</li>
              <li>Botをグループに管理者として追加（トピック管理権限を付与）</li>
              <li>グループ内でメッセージを送信後、「自動検出」でChat IDを取得</li>
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}
