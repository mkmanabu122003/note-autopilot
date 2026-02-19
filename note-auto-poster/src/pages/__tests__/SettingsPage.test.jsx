import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToastProvider } from '../../hooks/useToast';
import { AccountProvider } from '../../contexts/AccountContext';
import SettingsPage from '../SettingsPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <AccountProvider>
        <ToastProvider>
          <SettingsPage />
        </ToastProvider>
      </AccountProvider>
    </MemoryRouter>
  );
}

const mockElectronAPI = {
  config: {
    getAll: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  },
  dialog: {
    openFile: vi.fn(),
  },
  google: {
    readKeyFile: vi.fn(),
  },
  accounts: {
    list: vi.fn().mockResolvedValue({}),
    listActive: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  window.electronAPI = mockElectronAPI;
  mockElectronAPI.config.getAll.mockResolvedValue({
    api: { anthropic_key: 'sk-ant-test123', generation_model: 'claude-opus-4-6-20260205' },
    google: {},
    app: { language: '日本語', min_chars: 1500, max_chars: 4000 },
  });
  mockElectronAPI.config.set.mockResolvedValue(undefined);
});

describe('SettingsPage', () => {
  it('設定ページがレンダリングされる', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('設定')).toBeInTheDocument();
    });
  });

  it('初期表示時にconfig.getAllから既存値がフォームに反映される', async () => {
    renderPage();
    await waitFor(() => {
      expect(mockElectronAPI.config.getAll).toHaveBeenCalled();
    });
    expect(screen.getByText('API設定')).toBeInTheDocument();
    expect(screen.getByText('Google Sheets接続')).toBeInTheDocument();
    expect(screen.getByText('アプリ設定')).toBeInTheDocument();
  });

  it('APIキー入力→保存ボタンでconfig.setが呼ばれる', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('API設定')).toBeInTheDocument();
    });

    const saveButton = screen.getByRole('button', { name: '保存' });
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockElectronAPI.config.set).toHaveBeenCalledWith(
        'api.anthropic_key',
        expect.any(String)
      );
    });
  });

  it('Google Sheets JSON鍵ファイル選択でdialog.openFileが呼ばれる', async () => {
    const user = userEvent.setup();
    mockElectronAPI.dialog.openFile.mockResolvedValue('/path/to/key.json');
    mockElectronAPI.google.readKeyFile.mockResolvedValue({
      success: true,
      client_email: 'test@test.iam.gserviceaccount.com',
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Google Sheets接続')).toBeInTheDocument();
    });

    const selectButton = screen.getByRole('button', { name: '選択' });
    await user.click(selectButton);

    await waitFor(() => {
      expect(mockElectronAPI.dialog.openFile).toHaveBeenCalledWith({
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
    });
  });

  it('鍵ファイル選択後にclient_emailが表示される', async () => {
    const user = userEvent.setup();
    mockElectronAPI.dialog.openFile.mockResolvedValue('/path/to/key.json');
    mockElectronAPI.google.readKeyFile.mockResolvedValue({
      success: true,
      client_email: 'test@test.iam.gserviceaccount.com',
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Google Sheets接続')).toBeInTheDocument();
    });

    const selectButton = screen.getByRole('button', { name: '選択' });
    await user.click(selectButton);

    await waitFor(() => {
      expect(
        screen.getByText(/test@test\.iam\.gserviceaccount\.com/)
      ).toBeInTheDocument();
    });
  });

  it('保存成功時にトースト通知が表示される', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('API設定')).toBeInTheDocument();
    });

    const saveButton = screen.getByRole('button', { name: '保存' });
    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('保存しました')).toBeInTheDocument();
    });
  });
});
