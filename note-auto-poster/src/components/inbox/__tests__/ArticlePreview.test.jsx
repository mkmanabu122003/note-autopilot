import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToastProvider } from '../../../hooks/useToast';
import ArticlePreview from '../ArticlePreview';

const mockArticle = {
  id: 1,
  title: '【完全ロードマップ】未経験からツアーガイドで安定収益を得た全手順',
  pillar: 'guide_business',
  status: 'generated',
  body: '## はじめに\nこれはテスト本文です。\n<!-- paid-line -->\n## ステップ1\n有料エリアのコンテンツ',
  tags: ['ツアーガイド', '副業', 'インバウンド'],
  pricing: { is_paid: true, price: 3000, magazine: 'ツアーガイド実践マガジン' },
  generated_at: '2026-02-19T02:30:00.000Z',
  model: 'claude-opus-4-6-20260205',
  token_usage: { input: 1500, output: 2500 },
  batch_id: 'msgbatch_013Zva',
  regenerate_count: 0,
};

const mockElectronAPI = {
  articles: {
    update: vi.fn(),
  },
  topics: {
    updateStatus: vi.fn(),
  },
};

function renderPreview(props = {}) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ArticlePreview
          article={mockArticle}
          accountId="tokken"
          onUpdate={vi.fn()}
          onClose={vi.fn()}
          {...props}
        />
      </ToastProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.electronAPI = mockElectronAPI;
  mockElectronAPI.articles.update.mockResolvedValue({});
  mockElectronAPI.topics.updateStatus.mockResolvedValue({});
});

describe('ArticlePreview', () => {
  it('Markdownがレンダリングされる', () => {
    renderPreview();
    // The heading should be rendered
    expect(screen.getByText('はじめに')).toBeInTheDocument();
    expect(screen.getByText(/テスト本文/)).toBeInTheDocument();
  });

  it('paid-lineの位置に有料ライン区切りが表示される', () => {
    renderPreview();
    expect(screen.getByText(/ここから有料エリア/)).toBeInTheDocument();
  });

  it('承認ボタンでarticles.updateがstatus: reviewedで呼ばれる', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    renderPreview({ onUpdate });

    await user.click(screen.getByRole('button', { name: '承認' }));

    await waitFor(() => {
      expect(mockElectronAPI.articles.update).toHaveBeenCalledWith(
        'tokken',
        expect.objectContaining({
          status: 'reviewed',
          reviewed_at: expect.any(String),
        })
      );
    });
  });

  it('却下ボタンでarticles.updateがstatus: rejectedで呼ばれる', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    renderPreview({ onUpdate });

    await user.click(screen.getByRole('button', { name: '却下' }));

    await waitFor(() => {
      expect(mockElectronAPI.articles.update).toHaveBeenCalledWith(
        'tokken',
        expect.objectContaining({
          status: 'rejected',
        })
      );
    });
  });

  it('タブ切り替え（プレビュー/Markdown/メタ情報）が動作する', async () => {
    const user = userEvent.setup();
    renderPreview();

    // Initially on preview tab
    expect(screen.getByText('はじめに')).toBeInTheDocument();

    // Switch to Markdown tab
    await user.click(screen.getByRole('button', { name: 'Markdown' }));
    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeInTheDocument();
    expect(textarea.value).toContain('## はじめに');

    // Switch to Meta tab
    await user.click(screen.getByRole('button', { name: 'メタ情報' }));
    expect(screen.getByText('generated')).toBeInTheDocument();
    expect(screen.getByText(/claude-opus/)).toBeInTheDocument();
    expect(screen.getByText(/1,500/)).toBeInTheDocument();
    expect(screen.getByText(/2,500/)).toBeInTheDocument();
    expect(screen.getByText(/msgbatch_013Zva/)).toBeInTheDocument();
  });

  it('Markdownタブで編集→保存が機能する', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    renderPreview({ onUpdate });

    // Switch to Markdown tab
    await user.click(screen.getByRole('button', { name: 'Markdown' }));

    const textarea = screen.getByRole('textbox');
    await user.clear(textarea);
    await user.type(textarea, '# 新しい本文');

    await user.click(screen.getByRole('button', { name: '本文を保存' }));

    await waitFor(() => {
      expect(mockElectronAPI.articles.update).toHaveBeenCalledWith(
        'tokken',
        expect.objectContaining({
          body: '# 新しい本文',
        })
      );
    });
  });

  it('タグが表示される', () => {
    renderPreview();
    expect(screen.getByText('ツアーガイド')).toBeInTheDocument();
    expect(screen.getByText('副業')).toBeInTheDocument();
    expect(screen.getByText('インバウンド')).toBeInTheDocument();
  });

  it('閉じるボタンが動作する', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderPreview({ onClose });

    await user.click(screen.getByText('閉じる', { exact: false }));
    expect(onClose).toHaveBeenCalled();
  });
});
