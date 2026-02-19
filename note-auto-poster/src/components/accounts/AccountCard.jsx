import { useState } from 'react';
import { useToast } from '../../hooks/useToast';
import PillarList from './PillarList';
import PrivacySettings from './PrivacySettings';

export default function AccountCard({ accountId, initialData, onSave, onDelete }) {
  const { showToast } = useToast();
  const [data, setData] = useState({ ...initialData });
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  const update = (path, value) => {
    setData((prev) => {
      const next = { ...prev };
      const keys = path.split('.');
      let obj = next;
      for (let i = 0; i < keys.length - 1; i++) {
        obj[keys[i]] = { ...obj[keys[i]] };
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.electronAPI.accounts.set(accountId, data);
      showToast('保存しました', 'success');
      onSave?.();
    } catch (e) {
      showToast('保存に失敗しました: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await window.electronAPI.sheets.testConnection(accountId, {
        spreadsheet_id: data.sheets?.spreadsheet_id,
        sheet_name: data.sheets?.sheet_name,
      });
      setTestResult(result);
    } catch (e) {
      setTestResult({ success: false, error: e.message });
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = () => {
    if (window.confirm(`アカウント "${accountId}" を削除しますか？`)) {
      onDelete?.(accountId);
    }
  };

  return (
    <div className="border border-gray-300 rounded bg-white">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200 rounded-t">
        <span className="font-bold text-gray-800">{accountId}</span>
        <span className={`text-xs px-2 py-0.5 rounded ${data.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {data.enabled ? '有効' : '無効'}
        </span>
      </div>

      <div className="p-4 space-y-5">
        {/* 基本情報 */}
        <section>
          <h3 className="text-sm font-bold text-gray-700 mb-2">基本情報</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-600 shrink-0">表示名</label>
              <input
                value={data.display_name || ''}
                onChange={(e) => update('display_name', e.target.value)}
                className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-600 shrink-0">アカウントID</label>
              <span className="text-sm text-gray-500 font-mono">{accountId}（変更不可）</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-600 shrink-0">有効</label>
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={data.enabled ?? true}
                  onChange={(e) => update('enabled', e.target.checked)}
                />
                ON
              </label>
            </div>
          </div>
        </section>

        {/* Google Sheets */}
        <section>
          <h3 className="text-sm font-bold text-gray-700 mb-2">Google Sheets</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-600 shrink-0">スプレッドシートID</label>
              <input
                value={data.sheets?.spreadsheet_id || ''}
                onChange={(e) => update('sheets.spreadsheet_id', e.target.value)}
                className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm font-mono"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-600 shrink-0">シート名</label>
              <input
                value={data.sheets?.sheet_name || 'topics'}
                onChange={(e) => update('sheets.sheet_name', e.target.value)}
                className="w-48 border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleTestConnection}
                disabled={testing}
                className="px-3 py-1 text-sm rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-50"
              >
                {testing ? 'テスト中...' : '接続テスト'}
              </button>
              {testResult && (
                <span className={`text-sm ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                  {testResult.success
                    ? `${testResult.count}件のテーマを確認`
                    : testResult.error}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* note.com ログイン情報 */}
        <section>
          <h3 className="text-sm font-bold text-gray-700 mb-2">note.com ログイン情報</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-600 shrink-0">メール</label>
              <input
                type="email"
                value={data.note?.email || ''}
                onChange={(e) => update('note.email', e.target.value)}
                className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-600 shrink-0">パスワード</label>
              <input
                type="password"
                value={data.note?.password || ''}
                onChange={(e) => update('note.password', e.target.value)}
                className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-600 shrink-0">投稿モード</label>
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="radio"
                  name={`publish_${accountId}`}
                  value="draft"
                  checked={(data.note?.publish_status || 'draft') === 'draft'}
                  onChange={() => update('note.publish_status', 'draft')}
                />
                下書き
              </label>
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="radio"
                  name={`publish_${accountId}`}
                  value="public"
                  checked={data.note?.publish_status === 'public'}
                  onChange={() => update('note.publish_status', 'public')}
                />
                公開
              </label>
            </div>
          </div>
        </section>

        {/* コンテンツ柱 */}
        <PillarList
          pillars={data.pillars || []}
          onChange={(pillars) => update('pillars', pillars)}
        />

        {/* プライバシー設定 */}
        <PrivacySettings
          privacy={data.privacy || {}}
          onChange={(privacy) => update('privacy', privacy)}
        />

        {/* スケジュール */}
        <section>
          <h3 className="text-sm font-bold text-gray-700 mb-2">スケジュール</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-600 shrink-0">バッチ生成時刻</label>
              <input
                type="time"
                value={data.schedule?.batch_generation_time || '02:00'}
                onChange={(e) => update('schedule.batch_generation_time', e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-36 text-sm text-gray-600 shrink-0">自動投稿時刻</label>
              <input
                type="time"
                value={data.schedule?.auto_post_time || '12:00'}
                onChange={(e) => update('schedule.auto_post_time', e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </div>
          </div>
        </section>

        {/* アクション */}
        <div className="flex justify-end gap-3 pt-3 border-t border-gray-200">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
          <button
            onClick={handleDelete}
            className="px-4 py-2 text-sm rounded bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
          >
            削除
          </button>
        </div>
      </div>
    </div>
  );
}
