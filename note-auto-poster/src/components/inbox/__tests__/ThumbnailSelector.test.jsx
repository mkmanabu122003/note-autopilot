import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToastProvider } from '../../../hooks/useToast';
import ThumbnailSelector from '../ThumbnailSelector';

const mockArticle = {
  id: 'test-article-1',
  title: '【完全ロードマップ】未経験からツアーガイドで安定収益を得た全手順',
  pillar: 'guide_business',
  status: 'generated',
  body: '## テスト本文',
};

const mockThumbnails = [
  { pattern: 'a', path: '/path/to/pattern-a.png', exists: true },
  { pattern: 'b', path: '/path/to/pattern-b.png', exists: true },
  { pattern: 'c', path: '/path/to/pattern-c.png', exists: true },
  { pattern: 'd', path: '/path/to/pattern-d.png', exists: true },
  { pattern: 'e', path: '/path/to/pattern-e.png', exists: true },
  { pattern: 'f', path: '/path/to/pattern-f.png', exists: true },
];

function createMockElectronAPI() {
  return {
    thumbnails: {
      generate: vi.fn().mockResolvedValue(mockThumbnails),
      list: vi.fn().mockResolvedValue([]),
      select: vi.fn().mockResolvedValue('/path/to/selected.png'),
      readAsBase64: vi.fn().mockResolvedValue('data:image/png;base64,AAAA'),
    },
    articles: {
      update: vi.fn().mockResolvedValue({ success: true }),
    },
  };
}

function renderSelector(props = {}) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ThumbnailSelector
          article={mockArticle}
          accountId="tokken"
          onUpdate={vi.fn()}
          {...props}
        />
      </ToastProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.electronAPI = createMockElectronAPI();
});

describe('ThumbnailSelector', () => {
  it('未生成時に「生成」ボタンが表示される', async () => {
    renderSelector();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '6パターン生成' })).toBeInTheDocument();
    });
  });

  it('生成ボタンクリックで thumbnails.generate が呼ばれる', async () => {
    const user = userEvent.setup();
    renderSelector();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '6パターン生成' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '6パターン生成' }));

    await waitFor(() => {
      expect(window.electronAPI.thumbnails.generate).toHaveBeenCalledWith('tokken', mockArticle);
    });
  });

  it('生成中にローディング表示される', async () => {
    const user = userEvent.setup();
    // Make generate hang to observe loading state
    let resolveGenerate;
    window.electronAPI.thumbnails.generate.mockImplementation(
      () => new Promise((resolve) => { resolveGenerate = resolve; })
    );

    renderSelector();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '6パターン生成' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '6パターン生成' }));

    // Should show generating state
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '生成中...' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '生成中...' })).toBeDisabled();
    });

    // Cleanup: resolve the pending promise
    resolveGenerate(mockThumbnails);
  });

  it('生成済みで6枚の画像が表示される', async () => {
    window.electronAPI.thumbnails.list.mockResolvedValue(mockThumbnails);
    renderSelector();

    await waitFor(() => {
      expect(screen.getByText(/Pattern A/)).toBeInTheDocument();
      expect(screen.getByText(/Pattern B/)).toBeInTheDocument();
      expect(screen.getByText(/Pattern C/)).toBeInTheDocument();
      expect(screen.getByText(/Pattern D/)).toBeInTheDocument();
      expect(screen.getByText(/Pattern E/)).toBeInTheDocument();
      expect(screen.getByText(/Pattern F/)).toBeInTheDocument();
    });

    // Should have 6 images
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(6);
  });

  it('選択ボタンクリックで thumbnails.select が呼ばれる', async () => {
    const user = userEvent.setup();
    window.electronAPI.thumbnails.list.mockResolvedValue(mockThumbnails);
    renderSelector();

    await waitFor(() => {
      expect(screen.getByText(/Pattern A/)).toBeInTheDocument();
    });

    // Find all "選択" buttons and click the first one
    const selectButtons = screen.getAllByRole('button', { name: '選択' });
    await user.click(selectButtons[0]);

    await waitFor(() => {
      expect(window.electronAPI.thumbnails.select).toHaveBeenCalledWith(
        'tokken',
        'test-article-1',
        'a'
      );
    });
  });

  it('選択済みパターンにチェックマークが表示される', async () => {
    const user = userEvent.setup();
    window.electronAPI.thumbnails.list.mockResolvedValue(mockThumbnails);
    renderSelector();

    await waitFor(() => {
      expect(screen.getByText(/Pattern A/)).toBeInTheDocument();
    });

    const selectButtons = screen.getAllByRole('button', { name: '選択' });
    await user.click(selectButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('選択中')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '選択済み' })).toBeInTheDocument();
    });
  });

  it('生成済みの場合「再生成」ボタンが表示される', async () => {
    window.electronAPI.thumbnails.list.mockResolvedValue(mockThumbnails);
    renderSelector();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '再生成' })).toBeInTheDocument();
    });
  });
});
