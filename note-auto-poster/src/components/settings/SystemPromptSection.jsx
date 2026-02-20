import { useState, useEffect } from 'react';

export default function SystemPromptSection() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const text = await window.electronAPI.generator.getSystemPrompt();
        setPrompt(text || '');
      } catch {
        setPrompt('読み込みに失敗しました');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <section>
      <h2 className="text-base font-bold text-gray-800 mb-1">
        システムプロンプト
      </h2>
      <p className="text-xs text-gray-500 mb-3">
        記事生成時にAIへ渡されるベースプロンプトです（読み取り専用）。
      </p>
      <div className="bg-white border border-gray-200 rounded p-4">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 w-full text-left"
        >
          <span className="text-xs">{open ? '▼' : '▶'}</span>
          <span>{open ? 'プロンプトを閉じる' : 'プロンプトを表示'}</span>
          {!open && (
            <span className="text-xs text-gray-400 ml-auto">
              {prompt.length}文字
            </span>
          )}
        </button>
        {open && (
          <div className="mt-3 space-y-2">
            {loading ? (
              <p className="text-sm text-gray-400">読み込み中...</p>
            ) : (
              <>
                <pre className="w-full bg-gray-50 border border-gray-200 rounded p-3 text-xs font-mono whitespace-pre-wrap text-gray-700 max-h-[500px] overflow-y-auto">
                  {prompt}
                </pre>
                <span className="text-xs text-gray-400 block text-right">
                  {prompt.length}文字
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
