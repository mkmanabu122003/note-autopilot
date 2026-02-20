import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../hooks/useToast';

const PATTERN_NAMES = {
  a: 'ミニマル',
  b: 'マガジン',
  c: 'サイバー',
  d: '和エディトリアル',
  e: 'ポップ',
  f: 'ダーク＆ボールド',
};

export default function ThumbnailSelector({ article, accountId, onUpdate }) {
  const { showToast } = useToast();
  const [thumbnails, setThumbnails] = useState([]);
  const [imageData, setImageData] = useState({});
  const [generating, setGenerating] = useState(false);
  const [selectedPattern, setSelectedPattern] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadThumbnails = useCallback(async () => {
    if (!article?.id || !accountId) return;
    setLoading(true);
    try {
      const list = await window.electronAPI.thumbnails.list(accountId, article.id);
      setThumbnails(list || []);

      // Load images as base64 for display
      const data = {};
      for (const thumb of (list || [])) {
        try {
          const base64 = await window.electronAPI.thumbnails.readAsBase64(thumb.path);
          if (base64) data[thumb.pattern] = base64;
        } catch {
          // skip failed reads
        }
      }
      setImageData(data);
    } catch {
      setThumbnails([]);
    } finally {
      setLoading(false);
    }
  }, [article?.id, accountId]);

  useEffect(() => {
    loadThumbnails();
  }, [loadThumbnails]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await window.electronAPI.thumbnails.generate(accountId, article);
      if (result?.error) {
        showToast('サムネイル生成エラー: ' + result.error, 'error');
        return;
      }
      showToast('6パターンのサムネイルを生成しました', 'success');
      await loadThumbnails();
    } catch (e) {
      showToast('サムネイル生成に失敗しました: ' + (e.message || ''), 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleSelect = async (pattern) => {
    try {
      const selectedPath = await window.electronAPI.thumbnails.select(
        accountId,
        article.id,
        pattern
      );
      if (selectedPath?.error) {
        showToast('選択に失敗しました: ' + selectedPath.error, 'error');
        return;
      }
      setSelectedPattern(pattern);

      // Update article with thumbnail path
      await window.electronAPI.articles.update(accountId, {
        ...article,
        thumbnail: selectedPath,
      });
      showToast(`パターン${pattern.toUpperCase()}（${PATTERN_NAMES[pattern]}）を選択しました`, 'success');
      onUpdate?.();
    } catch (e) {
      showToast('選択に失敗しました: ' + (e.message || ''), 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
        読み込み中...
      </div>
    );
  }

  const hasThumbnails = thumbnails.length > 0;

  return (
    <div className="space-y-4">
      {/* Generate / Regenerate button */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {generating ? '生成中...' : hasThumbnails ? '再生成' : '6パターン生成'}
        </button>
        {generating && (
          <span className="text-xs text-gray-400">Playwrightでレンダリング中...</span>
        )}
      </div>

      {/* Thumbnail grid */}
      {hasThumbnails && (
        <div className="grid grid-cols-2 gap-3">
          {thumbnails.map((thumb) => {
            const isSelected = selectedPattern === thumb.pattern;
            return (
              <div
                key={thumb.pattern}
                className={`border rounded-lg overflow-hidden ${
                  isSelected
                    ? 'border-blue-500 ring-2 ring-blue-200'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="p-2 bg-gray-50 flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-600">
                    Pattern {thumb.pattern.toUpperCase()} — {PATTERN_NAMES[thumb.pattern]}
                  </span>
                  {isSelected && (
                    <span className="text-xs text-blue-600 font-medium">選択中</span>
                  )}
                </div>
                {imageData[thumb.pattern] ? (
                  <img
                    src={imageData[thumb.pattern]}
                    alt={`Pattern ${thumb.pattern.toUpperCase()}`}
                    className="w-full h-auto"
                  />
                ) : (
                  <div className="w-full h-24 bg-gray-100 flex items-center justify-center text-gray-400 text-xs">
                    画像を読み込めません
                  </div>
                )}
                <div className="p-2">
                  <button
                    onClick={() => handleSelect(thumb.pattern)}
                    disabled={isSelected}
                    className={`w-full px-3 py-1.5 text-xs rounded ${
                      isSelected
                        ? 'bg-blue-50 text-blue-600 border border-blue-200'
                        : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    {isSelected ? '選択済み' : '選択'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* No thumbnails message */}
      {!hasThumbnails && !generating && (
        <div className="py-8 text-center text-gray-400 text-sm">
          「6パターン生成」ボタンを押すとサムネイルが生成されます
        </div>
      )}

      {/* Selected info */}
      {selectedPattern && (
        <div className="text-sm text-gray-600 bg-blue-50 px-3 py-2 rounded">
          選択中: Pattern {selectedPattern.toUpperCase()} ({PATTERN_NAMES[selectedPattern]})
        </div>
      )}
    </div>
  );
}
