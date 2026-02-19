import { useState } from 'react';
import { useToast } from '../../hooks/useToast';

const GENERATION_MODELS = [
  'claude-opus-4-6-20260205',
  'claude-sonnet-4-20250514',
];

const SCORING_MODELS = [
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-20250514',
];

export default function ApiKeySection({ config, onConfigChange }) {
  const { showToast } = useToast();
  const [apiKey, setApiKey] = useState(config?.api?.anthropic_key || '');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [genModel, setGenModel] = useState(
    config?.api?.generation_model || GENERATION_MODELS[0]
  );
  const [scoreModel, setScoreModel] = useState(
    config?.api?.scoring_model || SCORING_MODELS[0]
  );

  const handleSaveKey = async () => {
    setSaving(true);
    try {
      const api = window.electronAPI;
      await api.config.set('api.anthropic_key', apiKey);
      showToast('保存しました', 'success');
      onConfigChange?.();
    } catch (e) {
      showToast('保存に失敗しました: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleModelChange = async (key, value, setter) => {
    setter(value);
    try {
      const api = window.electronAPI;
      await api.config.set(key, value);
      showToast('保存しました', 'success');
      onConfigChange?.();
    } catch (e) {
      showToast('保存に失敗しました', 'error');
    }
  };

  return (
    <section>
      <h2 className="text-base font-bold text-gray-800 mb-3">API設定</h2>
      <div className="bg-white border border-gray-200 rounded p-4 space-y-3">
        <div className="flex items-center gap-2">
          <label className="w-40 text-sm text-gray-600 shrink-0">
            Anthropic API Key
          </label>
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm font-mono"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="px-2 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100"
            title={showKey ? '非表示' : '表示'}
          >
            {showKey ? '\uD83D\uDC41' : '\uD83D\uDC41\u200D\uD83D\uDDE8'}
          </button>
          <button
            onClick={handleSaveKey}
            disabled={saving}
            className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <label className="w-40 text-sm text-gray-600 shrink-0">
            生成モデル
          </label>
          <select
            value={genModel}
            onChange={(e) =>
              handleModelChange('api.generation_model', e.target.value, setGenModel)
            }
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
          >
            {GENERATION_MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="w-40 text-sm text-gray-600 shrink-0">
            スコアリングモデル
          </label>
          <select
            value={scoreModel}
            onChange={(e) =>
              handleModelChange('api.scoring_model', e.target.value, setScoreModel)
            }
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
          >
            {SCORING_MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
