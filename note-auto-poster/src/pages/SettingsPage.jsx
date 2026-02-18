import { useState, useEffect } from 'react';
import { useAccount } from '../contexts/AccountContext';

export default function SettingsPage() {
  const { accounts, refreshAccounts } = useAccount();
  const [anthropicKey, setAnthropicKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [accountForm, setAccountForm] = useState({ email: '', password: '' });

  useEffect(() => {
    window.electronAPI.config.get('api').then((api) => {
      if (api?.anthropic_key) setAnthropicKey(api.anthropic_key);
    });
  }, []);

  const handleSaveApiKey = async () => {
    await window.electronAPI.config.set('api.anthropic_key', anthropicKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleToggleAccount = async (id, account) => {
    const updated = { ...account, enabled: !account.enabled };
    await window.electronAPI.accounts.set(id, updated);
    await refreshAccounts();
  };

  const handleEditNote = (id, account) => {
    setEditingAccount(id);
    setAccountForm({
      email: account.note?.email || '',
      password: account.note?.password || '',
    });
  };

  const handleSaveNote = async (id) => {
    const account = accounts[id];
    const updated = {
      ...account,
      note: { ...account.note, email: accountForm.email, password: accountForm.password },
    };
    await window.electronAPI.accounts.set(id, updated);
    await refreshAccounts();
    setEditingAccount(null);
  };

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">設定</h1>

      {/* APIキー設定 */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-700 mb-3">APIキー</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Anthropic API Key
            </label>
            <input
              type="password"
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleSaveApiKey}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            保存
          </button>
          {saved && (
            <span className="ml-3 text-green-600 text-sm">保存しました</span>
          )}
        </div>
      </section>

      {/* アカウント一覧 */}
      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">アカウント一覧</h2>
        {Object.keys(accounts).length === 0 ? (
          <p className="text-gray-500 text-sm">アカウントが登録されていません</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(accounts).map(([id, account]) => (
              <div key={id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-medium text-gray-800">
                      {account.display_name || id}
                    </span>
                    <span className="ml-2 text-sm text-gray-500">({id})</span>
                  </div>
                  <label className="flex items-center space-x-2">
                    <span className="text-sm text-gray-600">有効</span>
                    <input
                      type="checkbox"
                      checked={account.enabled || false}
                      onChange={() => handleToggleAccount(id, account)}
                      className="rounded"
                    />
                  </label>
                </div>

                {editingAccount === id ? (
                  <div className="mt-3 space-y-2">
                    <div>
                      <label className="block text-sm text-gray-600">メールアドレス</label>
                      <input
                        type="email"
                        value={accountForm.email}
                        onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600">パスワード</label>
                      <input
                        type="password"
                        value={accountForm.password}
                        onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleSaveNote(id)}
                        className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
                      >
                        保存
                      </button>
                      <button
                        onClick={() => setEditingAccount(null)}
                        className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-300"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => handleEditNote(id, account)}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-800"
                  >
                    noteログイン情報を編集
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
