import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { AccountProvider, useAccount } from '../AccountContext';

// electronAPI のモック
const mockAccounts = {
  tokken: { display_name: 'とっけん', enabled: true },
  test: { display_name: 'テスト', enabled: false },
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
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    },
  };
});

function TestConsumer() {
  const { accounts, currentAccountId, currentAccount, switchAccount } = useAccount();
  return (
    <div>
      <span data-testid="account-count">{Object.keys(accounts).length}</span>
      <span data-testid="current-id">{currentAccountId || 'none'}</span>
      <span data-testid="current-name">{currentAccount?.display_name || 'none'}</span>
      <button onClick={() => switchAccount('test')}>switch</button>
    </div>
  );
}

describe('AccountContext', () => {
  it('初期ロード時にアカウント一覧を取得し、最初のアカウントを選択する', async () => {
    render(
      <AccountProvider>
        <TestConsumer />
      </AccountProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('account-count').textContent).toBe('2');
    });
    expect(screen.getByTestId('current-id').textContent).toBe('tokken');
    expect(screen.getByTestId('current-name').textContent).toBe('とっけん');
  });

  it('switchAccount でアカウントを切り替えられる', async () => {
    render(
      <AccountProvider>
        <TestConsumer />
      </AccountProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-id').textContent).toBe('tokken');
    });

    await act(async () => {
      screen.getByText('switch').click();
    });

    expect(screen.getByTestId('current-id').textContent).toBe('test');
    expect(screen.getByTestId('current-name').textContent).toBe('テスト');
  });
});
