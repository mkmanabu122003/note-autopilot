import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock dependencies before importing the module
vi.mock('simple-git', () => ({ default: vi.fn() }));
vi.mock('../frontmatter', () => ({
  default: { parse: vi.fn(), stringify: vi.fn(), extractTitle: vi.fn() },
  parse: vi.fn(),
  stringify: vi.fn(),
  extractTitle: vi.fn(),
}));
vi.mock('../logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));
vi.mock('../config', () => ({
  default: { get: vi.fn(), getAccount: vi.fn() },
  get: vi.fn(),
  getAccount: vi.fn(),
}));
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test') },
}));

const { GitHubSync } = await import('../github-sync.js');

/**
 * Helper: create a mock git object with common methods.
 */
function createMockGit(overrides = {}) {
  return {
    pull: vi.fn().mockResolvedValue(undefined),
    merge: vi.fn().mockResolvedValue(undefined),
    raw: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    stash: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('GitHubSync._safePull', () => {
  let sync;

  beforeEach(() => {
    sync = new GitHubSync();
  });

  it('aborts any leftover merge state before pulling', async () => {
    const git = createMockGit();
    const result = await sync._safePull(git, 'main');
    expect(result).toBe(true);
    // merge --abort is called before pull to clean up stuck state
    expect(git.merge).toHaveBeenCalledWith(['--abort']);
    expect(git.pull).toHaveBeenCalledWith('origin', 'main');
  });

  it('returns true when pull succeeds normally', async () => {
    const git = createMockGit();
    const result = await sync._safePull(git, 'main');
    expect(result).toBe(true);
    expect(git.pull).toHaveBeenCalledWith('origin', 'main');
  });

  it('returns true when remote ref not found (empty repo)', async () => {
    const git = createMockGit({
      pull: vi.fn().mockRejectedValue(new Error("Couldn't find remote ref main")),
    });
    const result = await sync._safePull(git, 'main');
    expect(result).toBe(true);
  });

  it('resolves merge conflict by accepting theirs', async () => {
    const git = createMockGit({
      pull: vi.fn().mockRejectedValue(new Error('CONFLICT (content): Merge conflict in .github/workflows/ai-rewrite.yml')),
    });
    const result = await sync._safePull(git, 'main');
    expect(result).toBe(true);
    expect(git.raw).toHaveBeenCalledWith(['checkout', '--theirs', '.']);
    expect(git.add).toHaveBeenCalledWith('.');
    expect(git.commit).toHaveBeenCalledWith('[auto] 競合解決: リモート側の変更を優先');
  });

  it('resets to remote when conflict resolution fails', async () => {
    const git = createMockGit({
      pull: vi.fn().mockRejectedValue(new Error('Merge conflict in file')),
      raw: vi.fn()
        .mockRejectedValueOnce(new Error('checkout --theirs failed'))
        .mockResolvedValue(undefined),
      merge: vi.fn().mockResolvedValue(undefined),
    });
    const result = await sync._safePull(git, 'main');
    expect(result).toBe(true);
    // Should have tried to abort merge and reset
    expect(git.merge).toHaveBeenCalledWith(['--abort']);
    expect(git.raw).toHaveBeenCalledWith(['reset', '--hard', 'origin/main']);
  });

  it('stashes local changes, pulls, and pops stash', async () => {
    const git = createMockGit({
      pull: vi.fn()
        .mockRejectedValueOnce(new Error('Your local changes to the following files would be overwritten by merge'))
        .mockResolvedValue(undefined),
    });
    const result = await sync._safePull(git, 'main');
    expect(result).toBe(true);
    expect(git.stash).toHaveBeenCalledTimes(2); // stash() and stash(['pop'])
    expect(git.stash).toHaveBeenNthCalledWith(1);
    expect(git.stash).toHaveBeenNthCalledWith(2, ['pop']);
  });

  it('throws on unknown pull error', async () => {
    const git = createMockGit({
      pull: vi.fn().mockRejectedValue(new Error('network timeout')),
    });
    await expect(sync._safePull(git, 'main')).rejects.toThrow('network timeout');
  });

  it('handles "not possible because you have unmerged files" error', async () => {
    const git = createMockGit({
      pull: vi.fn().mockRejectedValue(new Error('Pull is not possible because you have unmerged files')),
    });
    const result = await sync._safePull(git, 'main');
    expect(result).toBe(true);
    expect(git.raw).toHaveBeenCalledWith(['checkout', '--theirs', '.']);
  });

  it('handles "Exiting because of an unresolved conflict" error (case-insensitive)', async () => {
    const git = createMockGit({
      pull: vi.fn().mockRejectedValue(new Error('Exiting because of an unresolved conflict.')),
    });
    const result = await sync._safePull(git, 'main');
    expect(result).toBe(true);
    expect(git.raw).toHaveBeenCalledWith(['checkout', '--theirs', '.']);
    expect(git.add).toHaveBeenCalledWith('.');
    expect(git.commit).toHaveBeenCalledWith('[auto] 競合解決: リモート側の変更を優先');
  });
});

describe('GitHubSync._safeMerge', () => {
  let sync;

  beforeEach(() => {
    sync = new GitHubSync();
  });

  it('merges successfully without conflict', async () => {
    const git = createMockGit();
    await sync._safeMerge(git, 'main');
    expect(git.merge).toHaveBeenCalledWith(['main']);
    expect(git.raw).not.toHaveBeenCalled();
  });

  it('resolves merge conflict by accepting theirs', async () => {
    const git = createMockGit({
      merge: vi.fn().mockRejectedValue(new Error('CONFLICT (content): Merge conflict in file.md')),
    });
    await sync._safeMerge(git, 'main');
    expect(git.raw).toHaveBeenCalledWith(['checkout', '--theirs', '.']);
    expect(git.add).toHaveBeenCalledWith('.');
    expect(git.commit).toHaveBeenCalledWith('[auto] 競合解決: mainのマージ');
  });

  it('aborts merge when conflict resolution fails', async () => {
    const mergeMock = vi.fn()
      .mockRejectedValueOnce(new Error('CONFLICT'))
      .mockResolvedValue(undefined);
    const git = createMockGit({
      merge: mergeMock,
      raw: vi.fn().mockRejectedValue(new Error('checkout failed')),
    });
    await sync._safeMerge(git, 'main');
    // Should attempt to abort the merge
    expect(mergeMock).toHaveBeenCalledWith(['--abort']);
  });

  it('silently handles non-conflict merge errors', async () => {
    const git = createMockGit({
      merge: vi.fn().mockRejectedValue(new Error('Already up to date.')),
    });
    // Should not throw
    await sync._safeMerge(git, 'main');
    expect(git.raw).not.toHaveBeenCalled();
  });
});
