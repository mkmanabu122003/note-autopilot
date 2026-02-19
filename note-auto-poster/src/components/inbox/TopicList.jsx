const STATUS_COLORS = {
  pending: 'bg-gray-200 text-gray-700',
  generating: 'bg-blue-200 text-blue-700 animate-pulse',
  generated: 'bg-green-200 text-green-700',
  error: 'bg-red-200 text-red-700',
};

export default function TopicList({ topics, selectedId, onSelect }) {
  if (topics.length === 0) {
    return (
      <p className="text-gray-400 text-sm p-4">テーマがありません</p>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {topics.map((topic) => (
        <div
          key={topic.id}
          onClick={() => onSelect?.(topic)}
          className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors ${
            selectedId === topic.id
              ? 'bg-blue-50 border-l-2 border-blue-500'
              : 'hover:bg-gray-50 border-l-2 border-transparent'
          }`}
        >
          <span className="w-8 text-gray-400 text-xs text-right shrink-0">
            {topic.id}
          </span>
          <span className="flex-1 truncate text-gray-800">
            {topic.theme || topic.title || '(テーマ名なし)'}
          </span>
          {topic.pillar && (
            <span className="text-xs text-gray-400 shrink-0">
              {topic.pillar.charAt(0).toUpperCase()}
            </span>
          )}
          <span
            className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
              STATUS_COLORS[topic.status] || STATUS_COLORS.pending
            }`}
          >
            {topic.status || 'pending'}
          </span>
        </div>
      ))}
    </div>
  );
}
