import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: 'レビュー待ち', text: '受信トレイ' },
  { to: '/dashboard', label: 'ダッシュボード', text: '概要' },
  { to: '/accounts', label: 'アカウント管理', text: 'ユーザー' },
  { to: '/settings', label: '設定', text: 'オプション' },
  { to: '/logs', label: 'エラーログ', text: 'ログ' },
];

export default function Sidebar() {
  return (
    <aside className="w-56 bg-gray-900 text-gray-100 flex flex-col">
      <div className="px-4 py-4 text-lg font-bold border-b border-gray-700">
        note AutoPoster
      </div>
      <nav className="flex-1 px-2 py-4 space-y-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            aria-label={link.label}
            className={({ isActive }) =>
              `block px-3 py-2 rounded text-sm ${
                isActive
                  ? 'bg-gray-700 text-white font-semibold'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            {link.text}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
