function scoreBadge(score) {
  if (score == null) return { emoji: '\u26AB', color: 'text-gray-400' };
  if (score >= 8) return { emoji: '\uD83D\uDFE2', color: 'text-green-600' };
  if (score >= 5) return { emoji: '\uD83D\uDFE1', color: 'text-yellow-600' };
  return { emoji: '\uD83D\uDD34', color: 'text-red-600' };
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function ArticleList({ articles, selectedId, onSelect, selectionMode, selectedIds, onToggleSelect, onSelectAll }) {
  if (articles.length === 0) {
    return (
      <p className="text-gray-400 text-sm p-4">記事がありません</p>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {selectionMode && (
        <div className="px-3 py-1.5 bg-gray-50 flex items-center gap-2">
          <input
            type="checkbox"
            checked={articles.length > 0 && selectedIds?.size === articles.length}
            onChange={() => onSelectAll?.()}
            className="w-4 h-4 rounded border-gray-300"
          />
          <span className="text-xs text-gray-500">
            すべて選択 ({selectedIds?.size || 0}/{articles.length})
          </span>
        </div>
      )}
      {articles.map((article) => {
        const badge = scoreBadge(article.score);
        const isSelected = selectedId === article.id;
        const isChecked = selectedIds?.has(article.id);

        return (
          <div
            key={article.id}
            onClick={() => selectionMode ? onToggleSelect?.(article.id) : onSelect(article)}
            className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
              isSelected && !selectionMode ? 'bg-blue-50' : ''
            } ${isChecked ? 'bg-red-50' : ''}`}
          >
            <div className="flex items-center gap-2">
              {selectionMode && (
                <input
                  type="checkbox"
                  checked={!!isChecked}
                  onChange={() => onToggleSelect?.(article.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 rounded border-gray-300"
                />
              )}
              <span className={badge.color} title={`スコア: ${article.score ?? '未'}`}>
                {badge.emoji}
              </span>
              <span className="flex-1 truncate text-sm text-gray-800">
                {article.title}
              </span>
            </div>
            <div className={`flex items-center gap-2 mt-0.5 ${selectionMode ? 'ml-12' : 'ml-6'} text-xs text-gray-400`}>
              <span>{article.pillar}</span>
              <span>
                {article.pricing?.is_paid
                  ? `\u00A5${article.pricing.price?.toLocaleString()}`
                  : '無料'}
              </span>
              <span>{formatDate(article.generated_at)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
