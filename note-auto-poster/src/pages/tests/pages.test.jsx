import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToastProvider } from '../../hooks/useToast';
import App from '../../App';
import InboxPage from '../InboxPage';
import DashboardPage from '../DashboardPage';
import SettingsPage from '../SettingsPage';
import AccountsPage from '../AccountsPage';

const mockElectronAPI = {
  ping: vi.fn().mockResolvedValue('pong'),
  config: {
    getAll: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  },
  accounts: {
    list: vi.fn().mockResolvedValue({}),
    listActive: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  },
  topics: {
    list: vi.fn().mockResolvedValue([]),
    listByStatus: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn().mockResolvedValue({}),
    add: vi.fn().mockResolvedValue({}),
    cache: vi.fn().mockResolvedValue(null),
  },
  generator: {
    run: vi.fn().mockResolvedValue({}),
    status: vi.fn().mockResolvedValue({}),
  },
  articles: {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({}),
  },
  dialog: {
    openFile: vi.fn().mockResolvedValue(null),
  },
  sheets: {
    testConnection: vi.fn().mockResolvedValue({ success: false }),
  },
  google: {
    readKeyFile: vi.fn().mockResolvedValue({ success: false }),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  window.electronAPI = mockElectronAPI;
});

function wrap(ui) {
  return (
    <MemoryRouter>
      <ToastProvider>{ui}</ToastProvider>
    </MemoryRouter>
  );
}

describe('ページレンダリング', () => {
  it('InboxPage がレンダリングされる', async () => {
    render(wrap(<InboxPage />));
    // InboxPage now has filter panel with view selector
    await waitFor(() => {
      expect(screen.getByLabelText('テーマ')).toBeInTheDocument();
    });
  });

  it('DashboardPage がレンダリングされる', () => {
    render(wrap(<DashboardPage />));
    expect(screen.getByText(/ダッシュボード/i)).toBeInTheDocument();
  });

  it('SettingsPage がレンダリングされる', async () => {
    render(wrap(<SettingsPage />));
    await waitFor(() => {
      expect(screen.getByText('設定')).toBeInTheDocument();
    });
  });

  it('AccountsPage がレンダリングされる', async () => {
    render(wrap(<AccountsPage />));
    await waitFor(() => {
      expect(screen.getByText(/アカウント管理/i)).toBeInTheDocument();
    });
  });
});

describe('App ルーティング', () => {
  it('/ で InboxPage が表示される', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByLabelText('テーマ')).toBeInTheDocument();
    });
  });

  it('/dashboard で DashboardPage が表示される', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </MemoryRouter>
    );
    expect(screen.getByText(/ダッシュボード/i)).toBeInTheDocument();
  });

  it('/settings で SettingsPage が表示される', async () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('設定')).toBeInTheDocument();
    });
  });

  it('/accounts で AccountsPage が表示される', async () => {
    render(
      <MemoryRouter initialEntries={['/accounts']}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText(/アカウント管理/i)).toBeInTheDocument();
    });
  });
});
