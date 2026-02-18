import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import App from '../../App';
import InboxPage from '../InboxPage';
import DashboardPage from '../DashboardPage';
import SettingsPage from '../SettingsPage';
import AccountsPage from '../AccountsPage';

describe('ページレンダリング', () => {
  it('InboxPage がレンダリングされる', () => {
    render(
      <MemoryRouter>
        <InboxPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/レビュー/i)).toBeInTheDocument();
  });

  it('DashboardPage がレンダリングされる', () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/ダッシュボード/i)).toBeInTheDocument();
  });

  it('SettingsPage がレンダリングされる', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/設定/i)).toBeInTheDocument();
  });

  it('AccountsPage がレンダリングされる', () => {
    render(
      <MemoryRouter>
        <AccountsPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/アカウント/i)).toBeInTheDocument();
  });
});

describe('App ルーティング', () => {
  it('/ で InboxPage が表示される', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByText(/レビュー/i)).toBeInTheDocument();
  });

  it('/dashboard で DashboardPage が表示される', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByText(/ダッシュボード/i)).toBeInTheDocument();
  });

  it('/settings で SettingsPage が表示される', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByText(/設定/i)).toBeInTheDocument();
  });

  it('/accounts で AccountsPage が表示される', () => {
    render(
      <MemoryRouter initialEntries={['/accounts']}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByText(/アカウント/i)).toBeInTheDocument();
  });
});
