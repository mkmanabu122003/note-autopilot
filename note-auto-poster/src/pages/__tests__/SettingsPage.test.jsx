import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import SettingsPage from '../SettingsPage';
import { AccountProvider } from '../../contexts/AccountContext';

const mockAccounts = {
  tokken: {
    display_name: 'とっけん',
    enabled: true,
    note: { email: 'tokken@example.com', password: 'pw123' },
  },
};

beforeEach(() => {
  window.electronAPI = {
    accounts: {
      list: vi.fn().mockResolvedValue(mockAccounts),
      listActive: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    },
    config: {
      getAll: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue({ anthropic_key: 'sk-ant-test' }),
      set: vi.fn().mockResolvedValue(undefined),
    },
  };
});

function renderSettingsPage() {
  return render(
    <AccountProvider>
      <SettingsPage />
    </AccountProvider>
  );
}

describe('SettingsPage', () => {
  it('ページタイトルが表示される', async () => {
    renderSettingsPage();
    expect(screen.getByText('設定')).toBeInTheDocument();
  });

  it('APIキーセクションが表示される', async () => {
    renderSettingsPage();
    expect(screen.getByText('APIキー')).toBeInTheDocument();
    expect(screen.getByText('Anthropic API Key')).toBeInTheDocument();
  });

  it('APIキー保存ボタンをクリックするとconfig.setが呼ばれる', async () => {
    renderSettingsPage();

    await waitFor(() => {
      expect(window.electronAPI.config.get).toHaveBeenCalledWith('api');
    });

    const saveButton = screen.getByText('保存');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(window.electronAPI.config.set).toHaveBeenCalledWith(
        'api.anthropic_key',
        expect.any(String)
      );
    });
  });

  it('アカウント一覧が表示される', async () => {
    renderSettingsPage();

    await waitFor(() => {
      expect(screen.getByText('とっけん')).toBeInTheDocument();
    });
  });

  it('アカウントの有効/無効チェックボックスが表示される', async () => {
    renderSettingsPage();

    await waitFor(() => {
      expect(screen.getByText('有効')).toBeInTheDocument();
    });

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();
  });

  it('noteログイン情報の編集ボタンが表示される', async () => {
    renderSettingsPage();

    await waitFor(() => {
      expect(screen.getByText('noteログイン情報を編集')).toBeInTheDocument();
    });
  });

  it('編集ボタンクリックでメール/パスワードフォームが表示される', async () => {
    renderSettingsPage();

    await waitFor(() => {
      expect(screen.getByText('noteログイン情報を編集')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('noteログイン情報を編集'));

    expect(screen.getByText('メールアドレス')).toBeInTheDocument();
    expect(screen.getByText('パスワード')).toBeInTheDocument();
  });
});
