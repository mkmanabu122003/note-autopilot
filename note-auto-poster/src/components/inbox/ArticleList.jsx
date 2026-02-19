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

export default function ArticleList({ articles, selectedId, onSelect }) {
  if (articles.length === 0) {
    return (
      <p className="text-gray-400 text-sm p-4">記事がありません</p>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {articles.map((article) => {
        const badge = scoreBadge(article.score);
        const isSelected = selectedId === article.id;

        return (
          <div
            key={article.id}
            onClick={() => onSelect(article)}
            className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
              isSelected ? 'bg-blue-50' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={badge.color} title={`スコア: ${article.score ?? '未'}`}>
                {badge.emoji}
              </span>
              <span className="flex-1 truncate text-sm text-gray-800">
                {article.title}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 ml-6 text-xs text-gray-400">
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
