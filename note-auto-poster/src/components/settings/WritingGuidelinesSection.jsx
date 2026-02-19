import { useState } from 'react';
import { useToast } from '../../hooks/useToast';

export default function WritingGuidelinesSection({ config, onConfigChange }) {
  const { showToast } = useToast();
  const [guidelines, setGuidelines] = useState(
    config?.article?.writing_guidelines || ''
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.electronAPI.config.set(
        'article.writing_guidelines',
        guidelines
      );
      showToast('ライティングガイドラインを保存しました', 'success');
      onConfigChange?.();
    } catch (e) {
      showToast('保存に失敗しました: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <h2 className="text-base font-bold text-gray-800 mb-1">
        ライティングガイドライン
      </h2>
      <p className="text-xs text-gray-500 mb-3">
        記事生成時にAIへ渡す執筆ルールです。全テーマ共通で適用されます。
      </p>
      <div className="bg-white border border-gray-200 rounded p-4 space-y-3">
        <textarea
          value={guidelines}
          onChange={(e) => setGuidelines(e.target.value)}
          placeholder={`例:\n1. エピソードは場所・人物・やり取りまで具体的に書く\n2. 対処法は「行動→結果」のセットで書く\n3. 太字の乱用・保険表現・説教調を避ける`}
          className="w-full border border-gray-300 rounded p-3 text-sm font-mono resize-y min-h-[200px]"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {guidelines.length > 0
              ? `${guidelines.length}文字`
              : '未設定（デフォルトのプロンプトのみで生成）'}
          </span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </section>
  );
}
