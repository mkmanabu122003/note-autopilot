import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToastProvider } from '../../hooks/useToast';
import InboxPage from '../InboxPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <InboxPage />
      </ToastProvider>
    </MemoryRouter>
  );
}

const mockTopics = [
  { id: 1, theme: '未経験からツアーガイドで安定収益を得る方法', pillar: 'guide_business', status: 'pending' },
  { id: 2, theme: '高評価を維持する秘訣', pillar: 'guide_business', status: 'generated' },
  { id: 3, theme: 'AIでツアー台本を作る', pillar: 'guide_ai', status: 'pending' },
];

const mockArticles = [
  {
    id: 1,
    title: '【完全ロードマップ】未経験からツアーガイドで安定収益を得た全手順',
    pillar: 'guide_business',
    status: 'generated',
    score: 9,
    pricing: { is_paid: true, price: 3000 },
    generated_at: '2026-02-19T02:30:00.000Z',
    body: '## はじめに\nテスト本文\n<!-- paid-line -->\n## 有料部分',
    tags: ['ツアーガイド', '副業'],
    model: 'claude-opus-4-6-20260205',
    token_usage: { input: 1500, output: 2500 },
    batch_id: 'msgbatch_013Zva',
    regenerate_count: 0,
  },
  {
    id: 2,
    title: '高評価を維持する方法',
    pillar: 'guide_business',
    status: 'reviewed',
    score: 6,
    pricing: { is_paid: true, price: 2500 },
    generated_at: '2026-02-19T03:00:00.000Z',
    body: '## テスト',
    tags: [],
  },
];

const mockAccounts = [
  { id: 'tokken', display_name: 'とっけん', enabled: true },
];

const mockAccountData = {
  display_name: 'とっけん',
  enabled: true,
  pillars: [
    { id: 'guide_business', name: 'ツアーガイド副業', prompt_file: '', magazine: '' },
    { id: 'guide_ai', name: 'AI効率化', prompt_file: '', magazine: '' },
  ],
};

const mockElectronAPI = {
  accounts: {
    listActive: vi.fn(),
    get: vi.fn(),
  },
  topics: {
    list: vi.fn(),
    updateStatus: vi.fn(),
  },
  articles: {
    list: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
  },
  generator: {
    run: vi.fn(),
    status: vi.fn(),
  },
  config: {
    getAll: vi.fn().mockResolvedValue({ api: { anthropic_key: 'sk-test' }, google: { key_file: '/key.json' } }),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  window.electronAPI = mockElectronAPI;
  mockElectronAPI.accounts.listActive.mockResolvedValue(mockAccounts);
  mockElectronAPI.accounts.get.mockResolvedValue(mockAccountData);
  mockElectronAPI.topics.list.mockResolvedValue(mockTopics);
  mockElectronAPI.articles.list.mockResolvedValue(mockArticles);
  mockElectronAPI.articles.get.mockResolvedValue(mockArticles[0]);
  mockElectronAPI.articles.update.mockResolvedValue({});
  mockElectronAPI.topics.updateStatus.mockResolvedValue({});
});

describe('InboxPage', () => {
  it('テーマビュー: topics.listのモックデータで一覧が表示される', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/未経験からツアーガイド/)).toBeInTheDocument();
    });
    expect(screen.getByText(/高評価を維持/)).toBeInTheDocument();
    expect(screen.getByText(/AIでツアー台本/)).toBeInTheDocument();
  });

  it('記事ビュー: articles.listのモックデータで一覧が表示される', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/未経験からツアーガイド/)).toBeInTheDocument();
    });

    // Switch to article view
    const articleRadio = screen.getByLabelText('記事');
    await user.click(articleRadio);

    await waitFor(() => {
      expect(screen.getByText(/【完全ロードマップ】/)).toBeInTheDocument();
    });
    expect(screen.getByText(/高評価を維持する方法/)).toBeInTheDocument();
  });

  it('ステータスフィルタが機能する', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/未経験からツアーガイド/)).toBeInTheDocument();
    });

    // Filter by 'generated' status
    const generatedCheckbox = screen.getByLabelText('generated');
    await user.click(generatedCheckbox);

    await waitFor(() => {
      expect(screen.getByText(/高評価を維持/)).toBeInTheDocument();
    });
    // Pending topics should be filtered out
    expect(screen.queryByText(/未経験からツアーガイドで安定収益を得る方法/)).not.toBeInTheDocument();
  });

  it('バッチ生成ボタン→確認ダイアログが表示される', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('バッチ生成を実行')).toBeInTheDocument();
    });

    await user.click(screen.getByText('バッチ生成を実行'));

    await waitFor(() => {
      expect(screen.getByText('バッチ生成を開始')).toBeInTheDocument();
    });
    expect(screen.getByText(/pendingテーマ/)).toBeInTheDocument();
    expect(screen.getByText('生成開始')).toBeInTheDocument();
  });

  it('記事クリックでプレビューパネルが表示される', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/未経験からツアーガイド/)).toBeInTheDocument();
    });

    // Switch to articles view
    const articleRadio = screen.getByLabelText('記事');
    await user.click(articleRadio);

    await waitFor(() => {
      expect(screen.getByText(/【完全ロードマップ】/)).toBeInTheDocument();
    });

    // Click on article
    await user.click(screen.getByText(/【完全ロードマップ】/));

    await waitFor(() => {
      expect(screen.getByText('閉じる', { exact: false })).toBeInTheDocument();
    });
    expect(screen.getByText('承認')).toBeInTheDocument();
    expect(screen.getByText('却下')).toBeInTheDocument();
  });
});
