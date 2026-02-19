import { useState, useEffect } from 'react';
import { useToast } from '../hooks/useToast';
import AccountCard from '../components/accounts/AccountCard';
import ConfirmDialog from '../components/common/ConfirmDialog';

const DEFAULT_ACCOUNT = {
  display_name: '',
  enabled: true,
  note: { email: '', password: '', publish_status: 'draft' },
  revenue: { monthly_target: 300000 },
  pillars: [],
  privacy: {
    real_name: 'hidden',
    international_marriage: 'hidden',
    residence: 'vague',
    guide_years: 'public',
    guest_count: 'public',
    review_rating: 'public',
    monthly_revenue: 'vague',
    ota_platform_names: 'hidden',
    ota_platform_count: 'vague',
    nihonneta: 'hidden',
    ai_tool_details: 'vague',
    activity_area: 'public',
  },
  sheets: { spreadsheet_id: '', sheet_name: 'topics' },
  schedule: { batch_generation_time: '02:00', auto_post_time: '12:00' },
};

export default function AccountsPage() {
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newId, setNewId] = useState('');

  const loadAccounts = async () => {
    try {
      const data = await window.electronAPI.accounts.list();
      setAccounts(data || {});
    } catch {
      setAccounts({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const handleAddAccount = async () => {
    const id = newId.trim();
    if (!id) return;
    if (accounts[id]) {
      showToast('このIDは既に存在します', 'error');
      return;
    }
    try {
      await window.electronAPI.accounts.set(id, { ...DEFAULT_ACCOUNT, display_name: id });
      showToast('アカウントを追加しました', 'success');
      setNewId('');
      setShowNewDialog(false);
      loadAccounts();
    } catch (e) {
      showToast('追加に失敗しました: ' + e.message, 'error');
    }
  };

  const handleDeleteAccount = async (id) => {
    try {
      await window.electronAPI.accounts.set(id, null);
      showToast('アカウントを削除しました', 'success');
      loadAccounts();
    } catch (e) {
      showToast('削除に失敗しました', 'error');
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">アカウント管理</h1>
        <p className="text-gray-500 text-sm">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">アカウント管理</h1>
        <button
          onClick={() => setShowNewDialog(true)}
          className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          + 新規追加
        </button>
      </div>

      <div className="space-y-6">
        {Object.entries(accounts).map(([id, data]) => (
          <AccountCard
            key={id}
            accountId={id}
            initialData={data}
            onSave={loadAccounts}
            onDelete={handleDeleteAccount}
          />
        ))}
        {Object.keys(accounts).length === 0 && (
          <p className="text-gray-500 text-sm">アカウントがありません。新規追加してください。</p>
        )}
      </div>

      {showNewDialog && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded shadow-xl max-w-sm w-full mx-4 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">新規アカウント</h3>
            <div className="mb-4">
              <label className="block text-sm text-gray-600 mb-1">アカウントID</label>
              <input
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                placeholder="例: tokken"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleAddAccount()}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowNewDialog(false); setNewId(''); }}
                className="px-4 py-2 text-sm rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
              >
                キャンセル
              </button>
              <button
                onClick={handleAddAccount}
                className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
              >
                作成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
