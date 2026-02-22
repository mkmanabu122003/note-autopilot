import { Routes, Route } from 'react-router-dom';
import { ToastProvider } from './hooks/useToast';
import { AccountProvider } from './contexts/AccountContext';
import Sidebar from './components/common/Sidebar';
import InboxPage from './pages/InboxPage';
import DashboardPage from './pages/DashboardPage';
import AccountsPage from './pages/AccountsPage';
import SettingsPage from './pages/SettingsPage';
import LogsPage from './pages/LogsPage';

export default function App() {
  return (
    <AccountProvider>
      <ToastProvider>
        <div className="flex h-screen bg-gray-50">
          <Sidebar />
          <main className="flex-1 overflow-auto">
            <Routes>
              <Route path="/" element={<InboxPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/accounts" element={<AccountsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/logs" element={<LogsPage />} />
            </Routes>
          </main>
        </div>
      </ToastProvider>
    </AccountProvider>
  );
}
