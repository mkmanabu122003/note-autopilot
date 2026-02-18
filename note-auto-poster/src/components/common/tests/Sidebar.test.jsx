import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import Sidebar from '../Sidebar';

describe('Sidebar', () => {
  it('全てのナビゲーションリンクが表示される', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    // 4つのページへのリンクが存在する
    expect(screen.getByRole('link', { name: /レビュー|受信/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ダッシュボード/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /アカウント/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /設定/i })).toBeInTheDocument();
  });

  it('各リンクのhrefが正しい', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    const links = screen.getAllByRole('link');
    const hrefs = links.map((link) => link.getAttribute('href'));
    expect(hrefs).toContain('/');
    expect(hrefs).toContain('/dashboard');
    expect(hrefs).toContain('/accounts');
    expect(hrefs).toContain('/settings');
  });

  it('アプリ名が表示される', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );
    expect(screen.getByText(/note AutoPoster/i)).toBeInTheDocument();
  });
});
