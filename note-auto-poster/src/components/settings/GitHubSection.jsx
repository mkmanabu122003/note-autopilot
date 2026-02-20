import { useState } from 'react';
import { useToast } from '../../hooks/useToast';

export default function GitHubSection({ config, onConfigChange }) {
  const { showToast } = useToast();
  const [token, setToken] = useState(config?.github?.token || '');
  const [repository, setRepository] = useState(config?.github?.repository || '');
  const [enabled, setEnabled] = useState(config?.github?.enabled || false);
  const [prMode, setPrMode] = useState(config?.github?.pr_mode || false);
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settingUp, setSettingUp] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const api = window.electronAPI;
      await api.config.set('github.token', token);
      await api.config.set('github.repository', repository);
      await api.config.set('github.enabled', enabled);
      await api.config.set('github.pr_mode', prMode);
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

  const handleSetupWorkflow = async () => {
    if (!token || !repository) {
      showToast('先にトークンとリポジトリを設定してください', 'error');
      return;
    }
    setSettingUp(true);
    try {
      const api = window.electronAPI;
      // Save settings first
      await api.config.set('github.token', token);
      await api.config.set('github.repository', repository);
      const result = await api.github.setupWorkflow();
      if (result.success) {
        if (result.noChanges) {
          showToast('ワークフローは最新です', 'info');
        } else {
          showToast('GitHub Actions ワークフローを配備しました', 'success');
        }
      } else {
        showToast('配備に失敗しました: ' + (result.error || ''), 'error');
      }
    } catch (e) {
      showToast('配備に失敗しました: ' + e.message, 'error');
    } finally {
      setSettingUp(false);
    }
  };

  return (
    <section>
      <h2 className="text-base font-bold text-gray-800 mb-3">GitHub連携</h2>
      <div className="bg-white border border-gray-200 rounded p-4 space-y-3">
        <p className="text-xs text-gray-500 mb-2">
          記事をGitHubリポジトリに同期し、GitHub Mobileから閲覧・編集・AIリライトできます。
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

        <div className="flex items-center gap-2">
          <label className="w-40 text-sm text-gray-600 shrink-0">
            PRモード
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={prMode}
              onChange={(e) => setPrMode(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-700">記事pushをPR経由にする</span>
          </label>
        </div>
        {prMode && (
          <p className="text-xs text-gray-400 ml-42 pl-40">
            記事がedit/ブランチにpushされ、PRが自動作成されます。PRコメントで /rewrite コマンドが使えます。
          </p>
        )}

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

        {/* GitHub Actions setup */}
        {enabled && (
          <div className="pt-3 border-t border-gray-200 space-y-2">
            <h3 className="text-sm font-bold text-gray-700">GitHub Actions（AIリライト）</h3>
            <p className="text-xs text-gray-500">
              PRコメントに <code className="bg-gray-100 px-1 rounded">/rewrite</code> と書くとAIが記事をリライトします。
              セットアップ後、リポジトリの Settings &gt; Secrets に <code className="bg-gray-100 px-1 rounded">ANTHROPIC_API_KEY</code> を追加してください。
            </p>
            <button
              onClick={handleSetupWorkflow}
              disabled={settingUp || !token || !repository}
              className="px-3 py-1 text-sm rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {settingUp ? 'セットアップ中...' : 'Actions ワークフローを配備'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
