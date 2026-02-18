import { HashRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/common/Sidebar';
import { AccountProvider } from './contexts/AccountContext';
import InboxPage from './pages/InboxPage';
import DashboardPage from './pages/DashboardPage';
import AccountsPage from './pages/AccountsPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  return (
    <AccountProvider>
      <HashRouter>
        <div className="flex h-screen bg-gray-50">
          <Sidebar />
          <main className="flex-1 overflow-auto">
            <Routes>
              <Route path="/" element={<InboxPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/accounts" element={<AccountsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
      </HashRouter>
    </AccountProvider>
  );
}
