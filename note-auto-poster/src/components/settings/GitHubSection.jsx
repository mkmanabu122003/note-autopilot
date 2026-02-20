import { useState } from 'react';
import { useToast } from '../../hooks/useToast';

export default function GitHubSection({ config, onConfigChange }) {
  const { showToast } = useToast();
  const [token, setToken] = useState(config?.github?.token || '');
  const [repository, setRepository] = useState(config?.github?.repository || '');
  const [enabled, setEnabled] = useState(config?.github?.enabled || false);
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const api = window.electronAPI;
      await api.config.set('github.token', token);
      await api.config.set('github.repository', repository);
      await api.config.set('github.enabled', enabled);
      showToast('GitHub設定を保存しました', 'success');
      onConfigChange?.();
    } catch (e) {
      showToast('保存に失敗しました: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!token || !repository) {
      showToast('トークンとリポジトリ名を入力してください', 'error');
      return;
    }
    setTesting(true);
    try {
      // Save first so the test uses the current values
      const api = window.electronAPI;
      await api.config.set('github.token', token);
      await api.config.set('github.repository', repository);
      const result = await api.github.testConnection();
      if (result.success) {
        showToast('接続テスト成功', 'success');
      } else {
        showToast('接続失敗: ' + (result.error || '不明なエラー'), 'error');
      }
    } catch (e) {
      showToast('テストに失敗しました: ' + e.message, 'error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <section>
      <h2 className="text-base font-bold text-gray-800 mb-3">GitHub連携</h2>
      <div className="bg-white border border-gray-200 rounded p-4 space-y-3">
        <p className="text-xs text-gray-500 mb-2">
          記事をGitHubリポジトリに同期し、GitHub Mobileから閲覧・編集できます。
        </p>

        <div className="flex items-center gap-2">
          <label className="w-40 text-sm text-gray-600 shrink-0">
            Personal Access Token
          </label>
          <input
            type={showToken ? 'text' : 'password'}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="github_pat_..."
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
          <label className="w-40 text-sm text-gray-600 shrink-0">
            リポジトリ
          </label>
          <input
            type="text"
            value={repository}
            onChange={(e) => setRepository(e.target.value)}
            placeholder="owner/repo-name"
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm font-mono"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="w-40 text-sm text-gray-600 shrink-0">
            自動同期
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-700">有効</span>
          </label>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={handleTest}
            disabled={testing || !token || !repository}
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
      </div>
    </section>
  );
}
