import { useState } from 'react';

export default function PillarList({ pillars, onChange }) {
  const [adding, setAdding] = useState(false);
  const [newPillar, setNewPillar] = useState({ id: '', name: '', prompt_file: '', magazine: '' });

  const handleRemove = (index) => {
    const updated = pillars.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handleAdd = () => {
    if (!newPillar.id || !newPillar.name) return;
    onChange([...pillars, { ...newPillar }]);
    setNewPillar({ id: '', name: '', prompt_file: '', magazine: '' });
    setAdding(false);
  };

  return (
    <div>
      <h3 className="text-sm font-bold text-gray-700 mb-2">コンテンツ柱（pillars）</h3>
      <div className="border border-gray-200 rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-3 py-1.5 text-gray-600 font-medium">ID</th>
              <th className="px-3 py-1.5 text-gray-600 font-medium">名前</th>
              <th className="px-3 py-1.5 text-gray-600 font-medium w-16"></th>
            </tr>
          </thead>
          <tbody>
            {pillars.map((p, i) => (
              <tr key={p.id} className="border-t border-gray-100">
                <td className="px-3 py-1.5 font-mono text-xs">{p.id}</td>
                <td className="px-3 py-1.5">{p.name}</td>
                <td className="px-3 py-1.5 text-right">
                  <button
                    onClick={() => handleRemove(i)}
                    className="text-red-500 hover:text-red-700 text-xs"
                    title="削除"
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adding ? (
        <div className="mt-2 p-3 border border-gray-200 rounded bg-gray-50 space-y-2">
          <div className="flex gap-2">
            <input
              placeholder="ID (例: guide_business)"
              value={newPillar.id}
              onChange={(e) => setNewPillar({ ...newPillar, id: e.target.value })}
              className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
            />
            <input
              placeholder="名前"
              value={newPillar.name}
              onChange={(e) => setNewPillar({ ...newPillar, name: e.target.value })}
              className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <input
              placeholder="プロンプトファイル"
              value={newPillar.prompt_file}
              onChange={(e) => setNewPillar({ ...newPillar, prompt_file: e.target.value })}
              className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
            />
            <input
              placeholder="マガジン名"
              value={newPillar.magazine}
              onChange={(e) => setNewPillar({ ...newPillar, magazine: e.target.value })}
              className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              追加
            </button>
            <button
              onClick={() => setAdding(false)}
              className="px-3 py-1 text-sm rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-2 text-sm text-blue-600 hover:text-blue-700"
        >
          + 柱を追加
        </button>
      )}
    </div>
  );
}
