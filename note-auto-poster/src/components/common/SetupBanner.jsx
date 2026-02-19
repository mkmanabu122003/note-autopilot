import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function SetupBanner() {
  const [checks, setChecks] = useState({
    apiKey: false,
    sheets: false,
    accounts: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const api = window.electronAPI;
        const config = await api.config.getAll();
        const accounts = await api.accounts.listActive();

        if (cancelled) return;
        setChecks({
          apiKey: !!config?.api?.anthropic_key,
          sheets: !!config?.google?.key_file,
          accounts: Array.isArray(accounts) && accounts.length > 0,
        });
      } catch {
        // ignore errors during setup check
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    check();
    return () => { cancelled = true; };
  }, []);

  if (loading) return null;

  const allDone = checks.apiKey && checks.sheets && checks.accounts;
  if (allDone) return null;

  return (
    <div className="bg-yellow-50 border border-yellow-300 rounded p-4 mb-4">
      <p className="font-bold text-yellow-800 mb-2">
        セットアップが完了していません
      </p>
      <ul className="space-y-1 text-sm">
        <li>
          {checks.apiKey ? '\u2705' : '\u2B1C'} Anthropic API Key{' '}
          {!checks.apiKey && (
            <Link to="/settings" className="text-blue-600 hover:underline ml-1">
              設定画面へ
            </Link>
          )}
        </li>
        <li>
          {checks.sheets ? '\u2705' : '\u2B1C'} Google Sheets接続{' '}
          {!checks.sheets && (
            <Link to="/settings" className="text-blue-600 hover:underline ml-1">
              設定画面へ
            </Link>
          )}
        </li>
        <li>
          {checks.accounts ? '\u2705' : '\u2B1C'} アカウント設定{' '}
          {!checks.accounts && (
            <Link to="/accounts" className="text-blue-600 hover:underline ml-1">
              アカウント画面へ
            </Link>
          )}
        </li>
      </ul>
    </div>
  );
}
