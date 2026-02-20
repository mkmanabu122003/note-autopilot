/**
 * GitHub Sync Service
 *
 * Manages bidirectional sync between local articles and a GitHub repository.
 * Uses simple-git for git operations.
 *
 * Repository structure:
 *   {accountId}/drafts/      - status: generated
 *   {accountId}/reviewing/   - status: reviewing
 *   {accountId}/approved/    - status: reviewed
 *   {accountId}/rejected/    - status: rejected
 */

const path = require('path');
const fs = require('fs');
const simpleGit = require('simple-git');
const frontmatter = require('./frontmatter');

const STATUS_DIR_MAP = {
  generated: 'drafts',
  reviewing: 'reviewing',
  reviewed: 'approved',
  rejected: 'rejected',
};

const DIR_STATUS_MAP = Object.fromEntries(
  Object.entries(STATUS_DIR_MAP).map(([k, v]) => [v, k])
);

class GitHubSync {
  constructor() {
    this._syncDir = null;
    this._git = null;
    this._lastSyncTime = null;
    this._syncing = false;
  }

  /**
   * Get the sync directory path for the configured repository.
   */
  async _getSyncDir() {
    if (this._syncDir) return this._syncDir;
    const config = require('./config');
    const repo = await config.get('github.repository');
    if (!repo) throw new Error('GitHubリポジトリが設定されていません');

    let dataDir;
    try {
      const { app } = require('electron');
      dataDir = app.getPath('userData');
    } catch {
      dataDir = path.join(__dirname, '..', '..');
    }

    const safeName = repo.replace('/', '_');
    this._syncDir = path.join(dataDir, 'github-sync', safeName);
    return this._syncDir;
  }

  /**
   * Get a simple-git instance for the sync directory.
   */
  async _getGit() {
    if (this._git) return this._git;
    const syncDir = await this._getSyncDir();
    if (!fs.existsSync(syncDir)) {
      fs.mkdirSync(syncDir, { recursive: true });
    }
    this._git = simpleGit(syncDir);
    return this._git;
  }

  /**
   * Get articles directory for an account.
   */
  _getArticlesDir(accountId) {
    try {
      const { app } = require('electron');
      return path.join(app.getPath('userData'), 'data', 'accounts', accountId, 'articles');
    } catch {
      return path.join(__dirname, '..', '..', 'data', 'accounts', accountId, 'articles');
    }
  }

  /**
   * Build the remote URL with token authentication.
   */
  async _getRemoteUrl() {
    const config = require('./config');
    const token = await config.get('github.token');
    const repo = await config.get('github.repository');
    if (!token || !repo) throw new Error('GitHub設定が不完全です');
    return `https://x-access-token:${token}@github.com/${repo}.git`;
  }

  /**
   * Initialize or clone the repository into the sync directory.
   */
  async init() {
    const git = await this._getGit();
    const syncDir = await this._getSyncDir();

    const isRepo = await git.checkIsRepo().catch(() => false);
    if (isRepo) {
      // Already initialized - update remote URL in case token changed
      const remoteUrl = await this._getRemoteUrl();
      try {
        await git.remote(['set-url', 'origin', remoteUrl]);
      } catch {
        // Remote might not exist yet
        await git.addRemote('origin', remoteUrl).catch(() => {});
      }
      return { status: 'ready', syncDir };
    }

    // Clone the repository
    const remoteUrl = await this._getRemoteUrl();
    try {
      const parentDir = path.dirname(syncDir);
      const dirName = path.basename(syncDir);
      await simpleGit(parentDir).clone(remoteUrl, dirName);
      this._git = simpleGit(syncDir);
      return { status: 'cloned', syncDir };
    } catch (err) {
      // If clone fails (empty repo), init locally and set remote
      if (err.message.includes('empty') || err.message.includes('warning')) {
        await git.init();
        await git.addRemote('origin', remoteUrl).catch(() => {});
        return { status: 'initialized', syncDir };
      }
      throw err;
    }
  }

  /**
   * Test the connection to the GitHub repository.
   */
  async testConnection() {
    try {
      const remoteUrl = await this._getRemoteUrl();
      const tmpDir = path.join(require('os').tmpdir(), `gh-test-${Date.now()}`);
      fs.mkdirSync(tmpDir, { recursive: true });
      try {
        await simpleGit(tmpDir).listRemote([remoteUrl]);
        return { success: true };
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Push a single article to the GitHub repository.
   * Copies the article to the sync dir in the correct status directory,
   * adds frontmatter, commits, and pushes.
   */
  async pushArticle(accountId, filename, status, metadata = {}) {
    if (this._syncing) return { skipped: true, reason: 'sync in progress' };

    try {
      this._syncing = true;
      await this.init();
      const git = await this._getGit();
      const syncDir = await this._getSyncDir();

      // Pull first to avoid conflicts
      try {
        await git.pull('origin', 'main', { '--rebase': 'true' });
      } catch {
        // Might fail if remote is empty
      }

      // Read the local article
      const articlesDir = this._getArticlesDir(accountId);
      const localPath = path.join(articlesDir, filename);
      if (!fs.existsSync(localPath)) {
        return { error: '記事ファイルが見つかりません' };
      }
      const content = fs.readFileSync(localPath, 'utf-8');

      // Parse existing frontmatter (if any) and merge metadata
      const { metadata: existing, body } = frontmatter.parse(content);
      const mergedMeta = {
        ...existing,
        account_id: accountId,
        status: status || 'generated',
        synced_at: new Date().toISOString(),
        ...metadata,
      };

      // Determine target directory based on status
      const statusDir = STATUS_DIR_MAP[mergedMeta.status] || 'drafts';
      const targetDir = path.join(syncDir, accountId, statusDir);
      fs.mkdirSync(targetDir, { recursive: true });

      // Remove from other status directories (in case status changed)
      for (const dir of Object.values(STATUS_DIR_MAP)) {
        if (dir === statusDir) continue;
        const oldPath = path.join(syncDir, accountId, dir, filename);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }

      // Write article with frontmatter to sync directory
      const targetPath = path.join(targetDir, filename);
      const articleWithFm = frontmatter.stringify(mergedMeta, body);
      fs.writeFileSync(targetPath, articleWithFm, 'utf-8');

      // Git add, commit, push
      await git.add('.');
      const statusResult = await git.status();
      if (statusResult.isClean()) {
        return { success: true, noChanges: true };
      }

      const title = frontmatter.extractTitle(body);
      const commitMsg = `[auto] ${this._statusLabel(mergedMeta.status)} - ${title || filename}`;
      await git.commit(commitMsg);

      try {
        await git.push('origin', 'main');
      } catch {
        // If main doesn't exist yet, push and set upstream
        await git.push(['-u', 'origin', 'main']);
      }

      this._lastSyncTime = new Date().toISOString();
      return { success: true, commitMsg };
    } finally {
      this._syncing = false;
    }
  }

  /**
   * Pull changes from GitHub and sync back to local articles directory.
   */
  async pull(accountId) {
    if (this._syncing) return { skipped: true, reason: 'sync in progress' };

    try {
      this._syncing = true;
      await this.init();
      const git = await this._getGit();
      const syncDir = await this._getSyncDir();

      // Pull latest
      try {
        await git.pull('origin', 'main');
      } catch (err) {
        if (err.message.includes("Couldn't find remote ref")) {
          return { success: true, changes: 0, message: 'リモートにまだコミットがありません' };
        }
        throw err;
      }

      // Scan the sync directory for this account's articles
      const articlesDir = this._getArticlesDir(accountId);
      if (!fs.existsSync(articlesDir)) {
        fs.mkdirSync(articlesDir, { recursive: true });
      }

      let changes = 0;

      for (const [status, dir] of Object.entries(STATUS_DIR_MAP)) {
        const statusPath = path.join(syncDir, accountId, dir);
        if (!fs.existsSync(statusPath)) continue;

        const files = fs.readdirSync(statusPath).filter(f => f.endsWith('.md'));
        for (const file of files) {
          const syncFilePath = path.join(statusPath, file);
          const localFilePath = path.join(articlesDir, file);
          const syncContent = fs.readFileSync(syncFilePath, 'utf-8');

          // Strip frontmatter for local storage
          const { body } = frontmatter.parse(syncContent);

          // Check if local file is different
          const localContent = fs.existsSync(localFilePath)
            ? fs.readFileSync(localFilePath, 'utf-8')
            : null;

          if (localContent !== body) {
            fs.writeFileSync(localFilePath, body, 'utf-8');
            changes++;
          }
        }
      }

      this._lastSyncTime = new Date().toISOString();
      return { success: true, changes };
    } finally {
      this._syncing = false;
    }
  }

  /**
   * Full sync: push all local articles, then pull remote changes.
   */
  async sync(accountId) {
    if (this._syncing) return { skipped: true, reason: 'sync in progress' };

    try {
      this._syncing = true;
      await this.init();
      const git = await this._getGit();
      const syncDir = await this._getSyncDir();

      // Pull first
      try {
        await git.pull('origin', 'main');
      } catch {
        // Ignore if remote is empty
      }

      // Push all local articles to sync dir
      const articlesDir = this._getArticlesDir(accountId);
      if (!fs.existsSync(articlesDir)) {
        return { success: true, pushed: 0, pulled: 0 };
      }

      const localFiles = fs.readdirSync(articlesDir).filter(f => f.endsWith('.md'));
      let pushed = 0;

      for (const file of localFiles) {
        const localPath = path.join(articlesDir, file);
        const content = fs.readFileSync(localPath, 'utf-8');
        const { metadata, body } = frontmatter.parse(content);
        const status = metadata.status || 'generated';
        const statusDir = STATUS_DIR_MAP[status] || 'drafts';
        const targetDir = path.join(syncDir, accountId, statusDir);
        fs.mkdirSync(targetDir, { recursive: true });

        const mergedMeta = {
          ...metadata,
          account_id: accountId,
          status,
          synced_at: new Date().toISOString(),
        };

        const targetPath = path.join(targetDir, file);
        const articleWithFm = frontmatter.stringify(mergedMeta, body);

        // Only write if different
        const existing = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf-8') : null;
        if (existing !== articleWithFm) {
          fs.writeFileSync(targetPath, articleWithFm, 'utf-8');
          pushed++;
        }
      }

      // Commit and push if there are changes
      await git.add('.');
      const statusResult = await git.status();
      if (!statusResult.isClean()) {
        await git.commit(`[auto] 同期 - ${accountId} (${pushed}件)`);
        try {
          await git.push('origin', 'main');
        } catch {
          await git.push(['-u', 'origin', 'main']);
        }
      }

      // Now pull remote changes back to local
      const pullResult = await this._pullToLocal(accountId, syncDir, articlesDir);

      this._lastSyncTime = new Date().toISOString();
      return { success: true, pushed, pulled: pullResult.changes };
    } finally {
      this._syncing = false;
    }
  }

  /**
   * Internal: pull sync dir content back to local articles.
   */
  _pullToLocal(accountId, syncDir, articlesDir) {
    let changes = 0;
    for (const [status, dir] of Object.entries(STATUS_DIR_MAP)) {
      const statusPath = path.join(syncDir, accountId, dir);
      if (!fs.existsSync(statusPath)) continue;

      const files = fs.readdirSync(statusPath).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const syncContent = fs.readFileSync(path.join(statusPath, file), 'utf-8');
        const { body } = frontmatter.parse(syncContent);
        const localPath = path.join(articlesDir, file);
        const localContent = fs.existsSync(localPath) ? fs.readFileSync(localPath, 'utf-8') : null;

        if (localContent !== body) {
          fs.writeFileSync(localPath, body, 'utf-8');
          changes++;
        }
      }
    }
    return { changes };
  }

  /**
   * Get current sync status.
   */
  getStatus() {
    return {
      syncing: this._syncing,
      lastSyncTime: this._lastSyncTime,
    };
  }

  /**
   * Human-readable status label.
   */
  _statusLabel(status) {
    const labels = {
      generated: '記事生成',
      reviewing: 'レビュー中',
      reviewed: '承認',
      rejected: '却下',
    };
    return labels[status] || 'ステータス変更';
  }

  /**
   * Reset the cached state (for testing or when settings change).
   */
  reset() {
    this._syncDir = null;
    this._git = null;
  }
}

// Singleton instance
const githubSync = new GitHubSync();

module.exports = { GitHubSync, githubSync };
