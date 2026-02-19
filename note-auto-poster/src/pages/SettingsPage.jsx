import { useState, useEffect } from 'react';

export default function SettingsPage() {
  const [keyPath, setKeyPath] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [sheetName, setSheetName] = useState('topics');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  // 設定を読み込み
  useEffect(() => {
    async function load() {
      if (!window.electronAPI?.settings) return;
      const path = await window.electronAPI.settings.get('api.google_service_account_key_path');
      if (path) setKeyPath(path);
      const account = await window.electronAPI.settings.getAccount('tokken');
      if (account?.sheets?.spreadsheet_id) setSpreadsheetId(account.sheets.spreadsheet_id);
      if (account?.sheets?.sheet_name) setSheetName(account.sheets.sheet_name);
    }
    load();
  }, []);

  // ファイル選択ダイアログ
  const handleSelectKey = async () => {
    if (!window.electronAPI?.settings) return;
    const selected = await window.electronAPI.settings.selectFile({
      title: 'サービスアカウントJSON鍵ファイルを選択',
    });
    if (selected) {
      setKeyPath(selected);
    }
  };

  // 設定を保存
  const handleSave = async () => {
    if (!window.electronAPI?.settings) return;
    setSaving(true);
    try {
      await window.electronAPI.settings.set('api.google_service_account_key_path', keyPath);
      await window.electronAPI.settings.setAccount('tokken', {
        sheets: { spreadsheet_id: spreadsheetId, sheet_name: sheetName },
      });
      setTestResult({ success: true, message: '設定を保存しました' });
    } catch (error) {
      setTestResult({ success: false, message: `保存に失敗しました: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  // 接続テスト
  const handleTestConnection = async () => {
    if (!window.electronAPI?.settings) return;
    setTesting(true);
    setTestResult(null);
    try {
      // まず設定を保存
      await window.electronAPI.settings.set('api.google_service_account_key_path', keyPath);
      await window.electronAPI.settings.setAccount('tokken', {
        sheets: { spreadsheet_id: spreadsheetId, sheet_name: sheetName },
      });
      const result = await window.electronAPI.settings.testConnection('tokken');
      if (result.success) {
        setTestResult({
          success: true,
          message: `接続成功！ ヘッダー行: ${result.headers?.join(', ') || '(空)'}`,
        });
      } else {
        setTestResult({ success: false, message: `接続失敗: ${result.error}` });
      }
    } catch (error) {
      setTestResult({ success: false, message: `エラー: ${error.message}` });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">設定</h1>

      {/* Google Sheets 設定 */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">Google Sheets 連携</h2>

        {/* サービスアカウントJSON鍵 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-600 mb-1">
            サービスアカウント JSON鍵ファイル
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={keyPath}
              onChange={(e) => setKeyPath(e.target.value)}
              placeholder="/path/to/service-account-key.json"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSelectKey}
              className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-md text-sm hover:bg-gray-200"
            >
              参照...
            </button>
          </div>
        </div>

        {/* スプレッドシートID */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-600 mb-1">
            スプレッドシートID
          </label>
          <input
            type="text"
            value={spreadsheetId}
            onChange={(e) => setSpreadsheetId(e.target.value)}
            placeholder="1aBcDeFgHiJkLmNoPqRsTuVwXyZ"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-400">
            スプレッドシートURLの /d/ と /edit の間の文字列
          </p>
        </div>

        {/* シート名 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-600 mb-1">
            シート名
          </label>
          <input
            type="text"
            value={sheetName}
            onChange={(e) => setSheetName(e.target.value)}
            placeholder="topics"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* ボタン */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
          <button
            onClick={handleTestConnection}
            disabled={testing || !keyPath || !spreadsheetId}
            className="px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 disabled:opacity-50"
          >
            {testing ? 'テスト中...' : '接続テスト'}
          </button>
        </div>

        {/* テスト結果 */}
        {testResult && (
          <div
            className={`mt-4 p-3 rounded-md text-sm ${
              testResult.success
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {testResult.message}
          </div>
        )}
      </section>
    </div>
  );
}
