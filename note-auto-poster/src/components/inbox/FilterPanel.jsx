export default function FilterPanel({
  accounts,
  selectedAccount,
  onAccountChange,
  view,
  onViewChange,
  statusFilters,
  onStatusFilterChange,
  pillars,
  pillarFilters,
  onPillarFilterChange,
  onRefresh,
}) {
  const topicStatuses = ['pending', 'generating', 'generated', 'error'];
  const articleStatuses = ['generated', 'reviewed', 'rejected', 'posted'];
  const statuses = view === 'topics' ? topicStatuses : articleStatuses;

  return (
    <div className="w-[200px] shrink-0 border-r border-gray-200 bg-gray-50 p-3 flex flex-col gap-4 overflow-y-auto">
      {/* アカウント切り替え */}
      <div>
        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
          アカウント
        </label>
        <select
          value={selectedAccount || ''}
          onChange={(e) => onAccountChange(e.target.value)}
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm bg-white"
        >
          <option value="">選択...</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.display_name || a.id}
            </option>
          ))}
        </select>
      </div>

      {/* ビュー切り替え */}
      <div>
        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
          ビュー
        </label>
        <div className="space-y-1">
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input
              type="radio"
              name="view"
              value="topics"
              checked={view === 'topics'}
              onChange={() => onViewChange('topics')}
            />
            テーマ
          </label>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input
              type="radio"
              name="view"
              value="articles"
              checked={view === 'articles'}
              onChange={() => onViewChange('articles')}
            />
            記事
          </label>
        </div>
      </div>

      {/* ステータスフィルタ */}
      <div>
        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
          ステータス
        </label>
        <div className="space-y-1">
          {statuses.map((s) => (
            <label key={s} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={statusFilters.includes(s)}
                onChange={() => onStatusFilterChange(s)}
              />
              {s}
            </label>
          ))}
        </div>
      </div>

      {/* 柱フィルタ */}
      {pillars.length > 0 && (
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
            柱
          </label>
          <div className="space-y-1">
            {pillars.map((p) => (
              <label key={p.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={pillarFilters.includes(p.id)}
                  onChange={() => onPillarFilterChange(p.id)}
                />
                <span className="truncate">{p.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-gray-200 pt-3 mt-auto">
        <button
          onClick={onRefresh}
          className="w-full px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-100"
        >
          更新
        </button>
      </div>
    </div>
  );
}
