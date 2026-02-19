import { useState } from 'react';
import { useToast } from '../../hooks/useToast';

export default function GoogleSheetsSection({ config, onConfigChange }) {
  const { showToast } = useToast();
  const [keyPath, setKeyPath] = useState(config?.google?.key_file || '');
  const [clientEmail, setClientEmail] = useState(
    config?.google?.client_email || ''
  );
  const [status, setStatus] = useState(
    config?.google?.key_file
      ? config?.google?.client_email
        ? 'authenticated'
        : 'selected'
      : 'none'
  );

  const handleSelectFile = async () => {
    try {
      const api = window.electronAPI;
      const filePath = await api.dialog.openFile({
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!filePath) return;

      setKeyPath(filePath);
      setStatus('selected');

      const result = await api.google.readKeyFile(filePath);
      if (result.success) {
        setClientEmail(result.client_email);
        setStatus('authenticated');
        await api.config.set('google.key_file', filePath);
        await api.config.set('google.client_email', result.client_email);
        await api.config.set('api.google_service_account_key_path', filePath);
        showToast('Google Sheets鍵ファイルを設定しました', 'success');
        onConfigChange?.();
      } else {
        showToast('鍵ファイルの読み取りに失敗: ' + result.error, 'error');
        setStatus('selected');
      }
    } catch (e) {
      showToast('ファイル選択に失敗しました', 'error');
    }
  };

  const statusIndicator = {
    none: { color: 'text-red-500', label: '未設定' },
    selected: { color: 'text-yellow-500', label: 'ファイル選択済み' },
    authenticated: { color: 'text-green-500', label: '認証済み' },
  };

  const s = statusIndicator[status];

  return (
    <section>
      <h2 className="text-base font-bold text-gray-800 mb-3">
        Google Sheets接続
      </h2>
      <div className="bg-white border border-gray-200 rounded p-4 space-y-3">
        <div>
          <label className="text-sm text-gray-600 block mb-1">
            サービスアカウントJSON鍵
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={keyPath}
              readOnly
              placeholder="/path/to/key.json"
              className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm font-mono bg-gray-50"
            />
            <button
              onClick={handleSelectFile}
              className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100"
            >
              選択
            </button>
          </div>
        </div>

        <div className="text-sm">
          <span className="text-gray-600">ステータス: </span>
          <span className={s.color}>{s.label}</span>
        </div>

        {clientEmail && (
          <div className="text-xs text-gray-500 font-mono">
            client_email: {clientEmail}
          </div>
        )}
      </div>
    </section>
  );
}
