import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToastProvider } from '../../hooks/useToast';
import AccountsPage from '../AccountsPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AccountsPage />
      </ToastProvider>
    </MemoryRouter>
  );
}

const mockAccounts = {
  tokken: {
    display_name: 'とっけん',
    enabled: true,
    note: { email: 'test@example.com', password: 'pass', publish_status: 'draft' },
    pillars: [
      { id: 'guide_business', name: 'ツアーガイド副業', prompt_file: 'p1.txt', magazine: 'マガジン1' },
    ],
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
    sheets: { spreadsheet_id: '1abc', sheet_name: 'topics' },
    schedule: { batch_generation_time: '02:00', auto_post_time: '12:00' },
  },
};

const mockElectronAPI = {
  accounts: {
    list: vi.fn(),
    listActive: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  },
  sheets: {
    testConnection: vi.fn(),
  },
  config: {
    getAll: vi.fn().mockResolvedValue({}),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  window.electronAPI = mockElectronAPI;
  mockElectronAPI.accounts.list.mockResolvedValue(mockAccounts);
  mockElectronAPI.accounts.set.mockResolvedValue(undefined);
});

describe('AccountsPage', () => {
  it('アカウント一覧が表示される', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('アカウント管理')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('tokken')).toBeInTheDocument();
    });
  });

  it('プライバシー設定の各ドロップダウンが正しい選択肢を持つ', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('tokken')).toBeInTheDocument();
    });

    // Check that privacy field labels exist
    expect(screen.getByText('本名')).toBeInTheDocument();
    expect(screen.getByText('国際結婚')).toBeInTheDocument();
    expect(screen.getByText('居住地')).toBeInTheDocument();
    expect(screen.getByText('ガイド歴')).toBeInTheDocument();

    // Check that privacy dropdowns have correct options
    const selects = screen.getAllByDisplayValue('hidden');
    expect(selects.length).toBeGreaterThan(0);

    // Verify options exist in the selects
    const options = screen.getAllByRole('option');
    const optionValues = options.map((o) => o.value);
    expect(optionValues).toContain('public');
    expect(optionValues).toContain('vague');
    expect(optionValues).toContain('hidden');
  });

  it('保存ボタンクリックでaccounts.setが正しいデータで呼ばれる', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('tokken')).toBeInTheDocument();
    });

    const saveButton = screen.getByRole('button', { name: '保存' });
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockElectronAPI.accounts.set).toHaveBeenCalledWith(
        'tokken',
        expect.objectContaining({
          display_name: 'とっけん',
          enabled: true,
        })
      );
    });
  });

  it('接続テストボタンでsheets.testConnectionが呼ばれる', async () => {
    const user = userEvent.setup();
    mockElectronAPI.sheets.testConnection.mockResolvedValue({
      success: true,
      count: 5,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('tokken')).toBeInTheDocument();
    });

    const testButton = screen.getByRole('button', { name: '接続テスト' });
    await user.click(testButton);

    await waitFor(() => {
      expect(mockElectronAPI.sheets.testConnection).toHaveBeenCalledWith('tokken', {
        spreadsheet_id: '1abc',
        sheet_name: 'topics',
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/5件のテーマを確認/)).toBeInTheDocument();
    });
  });

  it('新規追加ボタンでモーダルが表示される', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('アカウント管理')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: '+ 新規追加' });
    await user.click(addButton);

    expect(screen.getByText('新規アカウント')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('例: tokken')).toBeInTheDocument();
  });
});
