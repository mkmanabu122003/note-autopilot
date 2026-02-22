import { useState, useEffect, useCallback } from 'react';

const PAGE_SIZE = 50;
const LEVEL_COLORS = {
  error: 'bg-red-100 text-red-800',
  warn: 'bg-yellow-100 text-yellow-800',
  info: 'bg-blue-100 text-blue-800',
};

export default function LogsPage() {
  const [data, setData] = useState({ entries: [], total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [levelFilter, setLevelFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const loadLogs = useCallback(async (p) => {
    setLoading(true);
    try {
      const result = await window.electronAPI.logs.get({
        days,
        level: levelFilter,
        page: p ?? page,
        pageSize: PAGE_SIZE,
      });
      setData(result);
    } catch {
      setData({ entries: [], total: 0, page: 1, totalPages: 1 });
    } finally {
      setLoading(false);
    }
  }, [days, levelFilter, page]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => loadLogs(), 10000);
    return () => clearInterval(id);
  }, [autoRefresh, loadLogs]);

  const changePage = (newPage) => {
    setPage(newPage);
  };

  const changeFilter = (newLevel) => {
    setLevelFilter(newLevel);
    setPage(1);
  };

  const changeDays = (newDays) => {
    setDays(newDays);
    setPage(1);
  };

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-xl font-bold text-gray-800 mb-4">エラーログ</h1>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="text-sm text-gray-600">
          期間:
          <select
            value={days}
            onChange={e => changeDays(Number(e.target.value))}
            className="ml-1 border border-gray-300 rounded px-2 py-1 text-sm"
          >
            <option value={1}>1日</option>
            <option value={3}>3日</option>
            <option value={7}>7日</option>
            <option value={14}>14日</option>
            <option value={30}>30日</option>
          </select>
        </label>

        <label className="text-sm text-gray-600">
          レベル:
          <select
            value={levelFilter}
            onChange={e => changeFilter(e.target.value)}
            className="ml-1 border border-gray-300 rounded px-2 py-1 text-sm"
          >
            <option value="all">すべて</option>
            <option value="error">ERROR のみ</option>
            <option value="warn">WARN のみ</option>
            <option value="info">INFO のみ</option>
          </select>
        </label>

        <label className="flex items-center gap-1 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={e => setAutoRefresh(e.target.checked)}
            className="rounded"
          />
          自動更新(10秒)
        </label>

        <button
          onClick={() => loadLogs()}
          disabled={loading}
          className="px-3 py-1 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? '読込中...' : '更新'}
        </button>

        <span className="ml-auto px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-xs">
          全 {data.total} 件
        </span>
      </div>

      {/* Log table */}
      <div className="bg-white border border-gray-200 rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-left">
              <th className="px-3 py-2 w-44 text-gray-600 font-medium">日時</th>
              <th className="px-3 py-2 w-16 text-gray-600 font-medium">レベル</th>
              <th className="px-3 py-2 w-28 text-gray-600 font-medium">モジュール</th>
              <th className="px-3 py-2 text-gray-600 font-medium">メッセージ</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-gray-400">
                  {loading ? '読込中...' : 'ログがありません'}
                </td>
              </tr>
            ) : (
              data.entries.map((entry, i) => (
                <tr key={`${entry.timestamp}-${i}`} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-1.5 font-mono text-xs text-gray-500 whitespace-nowrap">
                    {new Date(entry.timestamp).toLocaleString('ja-JP')}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${LEVEL_COLORS[entry.level] || 'bg-gray-100 text-gray-600'}`}>
                      {entry.level.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs text-gray-600 whitespace-nowrap">
                    {entry.module}
                  </td>
                  <td className="px-3 py-1.5 text-gray-800 break-all">
                    {entry.message}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data.totalPages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-gray-500">
            {data.total} 件中 {(data.page - 1) * PAGE_SIZE + 1} - {Math.min(data.page * PAGE_SIZE, data.total)} 件
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => changePage(1)}
              disabled={data.page <= 1}
              className="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-30 hover:bg-gray-50"
            >
              &laquo;
            </button>
            <button
              onClick={() => changePage(page - 1)}
              disabled={data.page <= 1}
              className="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-30 hover:bg-gray-50"
            >
              &lsaquo;
            </button>
            <span className="px-3 py-1 text-xs text-gray-600">
              {data.page} / {data.totalPages}
            </span>
            <button
              onClick={() => changePage(page + 1)}
              disabled={data.page >= data.totalPages}
              className="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-30 hover:bg-gray-50"
            >
              &rsaquo;
            </button>
            <button
              onClick={() => changePage(data.totalPages)}
              disabled={data.page >= data.totalPages}
              className="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-30 hover:bg-gray-50"
            >
              &raquo;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
