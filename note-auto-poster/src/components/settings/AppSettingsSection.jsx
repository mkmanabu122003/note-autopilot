import { useState } from 'react';
import { useToast } from '../../hooks/useToast';

const LANGUAGES = ['日本語', 'English'];

export default function AppSettingsSection({ config, onConfigChange }) {
  const { showToast } = useToast();
  const [language, setLanguage] = useState(
    config?.app?.language || '日本語'
  );
  const [minChars, setMinChars] = useState(
    config?.app?.min_chars ?? 1500
  );
  const [maxChars, setMaxChars] = useState(
    config?.app?.max_chars ?? 4000
  );

  const handleChange = async (key, value, setter) => {
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
      <h2 className="text-base font-bold text-gray-800 mb-3">アプリ設定</h2>
      <div className="bg-white border border-gray-200 rounded p-4 space-y-3">
        <div className="flex items-center gap-2">
          <label className="w-40 text-sm text-gray-600 shrink-0">
            記事言語
          </label>
          <select
            value={language}
            onChange={(e) =>
              handleChange('app.language', e.target.value, setLanguage)
            }
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="w-40 text-sm text-gray-600 shrink-0">
            最小文字数
          </label>
          <input
            type="number"
            value={minChars}
            onChange={(e) =>
              handleChange('app.min_chars', Number(e.target.value), setMinChars)
            }
            className="w-32 border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="w-40 text-sm text-gray-600 shrink-0">
            最大文字数
          </label>
          <input
            type="number"
            value={maxChars}
            onChange={(e) =>
              handleChange('app.max_chars', Number(e.target.value), setMaxChars)
            }
            className="w-32 border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
      </div>
    </section>
  );
}
