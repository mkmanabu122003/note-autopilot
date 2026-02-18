import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: 'レビュー待ち' },
  { to: '/dashboard', label: 'ダッシュボード' },
  { to: '/accounts', label: 'アカウント管理' },
  { to: '/settings', label: '設定' },
];

export default function Sidebar() {
  return (
    <aside className="w-56 bg-gray-900 text-gray-100 flex flex-col">
      <div className="px-4 py-4 text-lg font-bold border-b border-gray-700">
        note-auto-poster
      </div>
      <nav className="flex-1 px-2 py-4 space-y-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) =>
              `block px-3 py-2 rounded text-sm ${
                isActive
                  ? 'bg-gray-700 text-white font-semibold'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
