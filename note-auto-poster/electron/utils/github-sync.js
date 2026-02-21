/**
 * GitHub Sync Service
 *
 * Manages bidirectional sync between local articles and a GitHub repository.
 * Uses simple-git for git operations and GitHub REST API for PR management.
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
   * Get GitHub API headers.
   */
  async _getApiHeaders() {
    const config = require('./config');
    const token = await config.get('github.token');
    if (!token) throw new Error('GitHub トークンが設定されていません');
    return {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };
  }

  /**
   * Get owner and repo from the configured repository string.
   */
  async _getOwnerRepo() {
    const config = require('./config');
    const repo = await config.get('github.repository');
    if (!repo || !repo.includes('/')) throw new Error('リポジトリ名が無効です');
    const [owner, name] = repo.split('/');
    return { owner, repo: name };
  }

  /**
   * Call the GitHub REST API.
   */
  async _githubApi(method, endpoint, body = null) {
    const headers = await this._getApiHeaders();
    const { owner, repo } = await this._getOwnerRepo();
    const url = `https://api.github.com/repos/${owner}/${repo}${endpoint}`;

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(url, options);
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`GitHub API ${res.status}: ${text}`);
    }

    return text ? JSON.parse(text) : null;
  }

  /**
   * Initialize or clone the repository into the sync directory.
   */
  async init() {
    const git = await this._getGit();
    const syncDir = await this._getSyncDir();

    const isRepo = await git.checkIsRepo().catch(() => false);
    if (isRepo) {
      const remoteUrl = await this._getRemoteUrl();
      try {
        await git.remote(['set-url', 'origin', remoteUrl]);
      } catch {
        await git.addRemote('origin', remoteUrl).catch(() => {});
      }
      return { status: 'ready', syncDir };
    }

    const remoteUrl = await this._getRemoteUrl();
    try {
      const parentDir = path.dirname(syncDir);
      const dirName = path.basename(syncDir);
      await simpleGit(parentDir).clone(remoteUrl, dirName);
      this._git = simpleGit(syncDir);
      return { status: 'cloned', syncDir };
    } catch (err) {
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

  // ─── Phase 1: Direct push to main ───

  /**
   * Push a single article to the GitHub repository (main branch).
   */
  async pushArticle(accountId, filename, status, metadata = {}) {
    if (this._syncing) return { skipped: true, reason: 'sync in progress' };

    try {
      this._syncing = true;
      await this.init();
      const git = await this._getGit();
      const syncDir = await this._getSyncDir();

      // Ensure we're on main
      await this._ensureMainBranch(git);

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

      const { metadata: existing, body } = frontmatter.parse(content);
      const mergedMeta = {
        ...existing,
        account_id: accountId,
        status: status || 'generated',
        synced_at: new Date().toISOString(),
        ...metadata,
      };

      const statusDir = STATUS_DIR_MAP[mergedMeta.status] || 'drafts';
      const targetDir = path.join(syncDir, accountId, statusDir);
      fs.mkdirSync(targetDir, { recursive: true });

      // Remove from other status directories
      for (const dir of Object.values(STATUS_DIR_MAP)) {
        if (dir === statusDir) continue;
        const oldPath = path.join(syncDir, accountId, dir, filename);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }

      const targetPath = path.join(targetDir, filename);
      const articleWithFm = frontmatter.stringify(mergedMeta, body);
      fs.writeFileSync(targetPath, articleWithFm, 'utf-8');

      await git.add([accountId]);
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
        await git.push(['-u', 'origin', 'main']);
      }

      this._lastSyncTime = new Date().toISOString();
      return { success: true, commitMsg };
    } finally {
      this._syncing = false;
    }
  }

  // ─── Phase 2: PR-based push flow ───

  /**
   * Push article to an edit branch and create/update a PR.
   * Branch naming: edit/{accountId}/{YYYY-MM-DD}
   */
  async pushArticleToPR(accountId, filename, status, metadata = {}) {
    if (this._syncing) return { skipped: true, reason: 'sync in progress' };

    try {
      this._syncing = true;
      await this.init();
      const git = await this._getGit();
      const syncDir = await this._getSyncDir();

      // Build branch name
      const today = new Date().toISOString().split('T')[0];
      const branchName = `edit/${accountId}/${today}`;

      // Ensure main is up to date
      await this._ensureMainBranch(git);
      try {
        await git.pull('origin', 'main', { '--rebase': 'true' });
      } catch {
        // Remote might be empty
      }

      // Create or checkout the edit branch
      const branches = await git.branchLocal();
      if (branches.all.includes(branchName)) {
        await git.checkout(branchName);
        // Merge main into it to stay up-to-date
        try { await git.merge(['main']); } catch { /* ignore */ }
      } else {
        await git.checkoutLocalBranch(branchName);
      }

      // Read and write article
      const articlesDir = this._getArticlesDir(accountId);
      const localPath = path.join(articlesDir, filename);
      if (!fs.existsSync(localPath)) {
        await git.checkout('main');
        return { error: '記事ファイルが見つかりません' };
      }
      const content = fs.readFileSync(localPath, 'utf-8');

      const { metadata: existing, body } = frontmatter.parse(content);
      const mergedMeta = {
        ...existing,
        account_id: accountId,
        status: status || 'generated',
        synced_at: new Date().toISOString(),
        ...metadata,
      };

      const statusDir = STATUS_DIR_MAP[mergedMeta.status] || 'drafts';
      const targetDir = path.join(syncDir, accountId, statusDir);
      fs.mkdirSync(targetDir, { recursive: true });

      // Remove from other status directories
      for (const dir of Object.values(STATUS_DIR_MAP)) {
        if (dir === statusDir) continue;
        const oldPath = path.join(syncDir, accountId, dir, filename);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }

      const targetPath = path.join(targetDir, filename);
      const articleWithFm = frontmatter.stringify(mergedMeta, body);
      fs.writeFileSync(targetPath, articleWithFm, 'utf-8');

      // Also sync .rewrite-config.yml
      await this._syncRewriteConfig(syncDir);

      await git.add([accountId, '.rewrite-config.yml']);
      const statusResult = await git.status();
      if (statusResult.isClean()) {
        await git.checkout('main');
        return { success: true, noChanges: true };
      }

      const title = frontmatter.extractTitle(body);
      const commitMsg = `[auto] ${this._statusLabel(mergedMeta.status)} - ${title || filename}`;
      await git.commit(commitMsg);

      // Push the edit branch
      try {
        await git.push('origin', branchName);
      } catch {
        await git.push(['-u', 'origin', branchName]);
      }

      // Create or update PR
      const pr = await this._ensurePR(accountId, branchName, today);

      // Go back to main
      await git.checkout('main');

      this._lastSyncTime = new Date().toISOString();
      return { success: true, commitMsg, pr };
    } finally {
      this._syncing = false;
    }
  }

  /**
   * Ensure a PR exists for the given branch. If not, create one.
   */
  async _ensurePR(accountId, branchName, date) {
    try {
      // Check for existing PRs from this branch
      const prs = await this._githubApi('GET', `/pulls?head=${encodeURIComponent((await this._getOwnerRepo()).owner + ':' + branchName)}&state=open`);

      if (prs && prs.length > 0) {
        return { url: prs[0].html_url, number: prs[0].number, created: false };
      }

      // Count files in this branch
      const syncDir = await this._getSyncDir();
      const accountDir = path.join(syncDir, accountId);
      let fileCount = 0;
      if (fs.existsSync(accountDir)) {
        for (const dir of Object.values(STATUS_DIR_MAP)) {
          const dirPath = path.join(accountDir, dir);
          if (fs.existsSync(dirPath)) {
            fileCount += fs.readdirSync(dirPath).filter(f => f.endsWith('.md')).length;
          }
        }
      }

      const config = require('./config');
      const account = await config.getAccount(accountId);
      const displayName = account?.display_name || accountId;

      const prTitle = `[${displayName}] ${date} の記事（${fileCount}件）`;
      const prBody = [
        `## 記事の編集PR`,
        '',
        `アカウント: **${displayName}**`,
        `日付: ${date}`,
        `記事数: ${fileCount}件`,
        '',
        '### 使い方',
        '- ファイルを直接編集して記事を修正できます',
        '- `/rewrite` コマンドをコメントに書くとAIリライトが実行されます',
        '- マージすると main ブランチに反映され、次回アプリ起動時に同期されます',
        '',
        '### /rewrite コマンド例',
        '```',
        '/rewrite もっとカジュアルな文体にしてください',
        '/rewrite AIの基礎.md 具体例を増やして',
        '/rewrite L10-L25 この段落を書き直して',
        '/rewrite undo',
        '/rewrite diff もっと分かりやすく',
        '```',
      ].join('\n');

      const newPr = await this._githubApi('POST', '/pulls', {
        title: prTitle,
        body: prBody,
        head: branchName,
        base: 'main',
      });

      return { url: newPr.html_url, number: newPr.number, created: true };
    } catch (err) {
      console.error('[github-sync] PR creation failed:', err.message);
      return { error: err.message };
    }
  }

  // ─── Phase 2: Workflow & Config deployment ───

  /**
   * Deploy GitHub Actions workflow and rewrite scripts via GitHub Contents API.
   * This avoids the need for the 'workflow' scope on the PAT.
   */
  async setupWorkflow() {
    if (this._syncing) return { skipped: true, reason: 'sync in progress' };

    try {
      this._syncing = true;

      const syncDir = await this._getSyncDir();
      const git = simpleGit(syncDir);

      // Initialize repo if needed
      if (!fs.existsSync(path.join(syncDir, '.git'))) {
        fs.mkdirSync(syncDir, { recursive: true });
        await git.init();
        const remoteUrl = await this._getRemoteUrl();
        await git.addRemote('origin', remoteUrl);
      }

      // Pull latest main
      try {
        await git.fetch('origin', 'main');
        await git.checkout('main');
        await git.pull('origin', 'main');
      } catch {
        // Empty repo or first time - create initial commit if needed
        const statusResult = await git.status();
        if (statusResult.current !== 'main') {
          try { await git.checkout('main'); } catch { await git.checkoutLocalBranch('main'); }
        }
      }

      // Deploy workflow files via git
      const filesToDeploy = [
        { repoPath: '.github/workflows/ai-rewrite.yml', templateName: 'ai-rewrite.yml' },
        { repoPath: '.github/scripts/rewrite-parser.js', templateName: 'rewrite-parser.js' },
        { repoPath: '.github/scripts/rewrite.js', templateName: 'rewrite.js' },
      ];

      let deployed = 0;
      for (const { repoPath, templateName } of filesToDeploy) {
        const templatePath = path.join(__dirname, '..', 'templates', templateName);
        const content = fs.readFileSync(templatePath, 'utf-8');

        const targetPath = path.join(syncDir, repoPath);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, content, 'utf-8');
        deployed++;
      }

      // Also deploy .rewrite-config.yml
      const config = require('./config');
      const writingGuidelines = await config.get('article.writing_guidelines') || '';
      const model = await config.get('api.generation_model') || 'claude-sonnet-4-5-20250929';

      const configYaml = [
        '# リライト時に適用するライティングガイドライン',
        'writing_guidelines: |',
        ...writingGuidelines.split('\n').map(l => `  ${l}`),
        '',
        '# 使用するモデル',
        `model: ${model}`,
        '',
        '# リライト時の追加システムプロンプト',
        'additional_prompt: |',
        '  リライト時は元の記事の構成と主張を維持しつつ、',
        '  指示された箇所のみを改善してください。',
        '  <!-- paid-line --> の位置は変更しないでください。',
      ].join('\n');

      fs.writeFileSync(path.join(syncDir, '.rewrite-config.yml'), configYaml, 'utf-8');

      // Git add, commit, push
      await git.add(['.github', '.rewrite-config.yml']);
      const statusResult = await git.status();
      if (!statusResult.isClean()) {
        await git.commit('[setup] AIリライトワークフローを配備');
        try {
          await git.push('origin', 'main');
        } catch {
          await git.push(['-u', 'origin', 'main']);
        }
      }

      this._lastSyncTime = new Date().toISOString();
      return { success: true, deployed };
    } finally {
      this._syncing = false;
    }
  }

  /**
   * Sync .rewrite-config.yml from app settings to the sync directory.
   */
  async _syncRewriteConfig(syncDir) {
    const config = require('./config');
    const writingGuidelines = await config.get('article.writing_guidelines') || '';
    const model = await config.get('api.generation_model') || 'claude-sonnet-4-5-20250929';

    const configYaml = [
      '# リライト時に適用するライティングガイドライン',
      'writing_guidelines: |',
      ...writingGuidelines.split('\n').map(l => `  ${l}`),
      '',
      '# 使用するモデル',
      `model: ${model}`,
      '',
      '# リライト時の追加システムプロンプト',
      'additional_prompt: |',
      '  リライト時は元の記事の構成と主張を維持しつつ、',
      '  指示された箇所のみを改善してください。',
      '  <!-- paid-line --> の位置は変更しないでください。',
    ].join('\n');

    fs.writeFileSync(path.join(syncDir, '.rewrite-config.yml'), configYaml, 'utf-8');
  }

  // ─── Phase 1: Pull & Sync ───

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

      await this._ensureMainBranch(git);

      try {
        await git.pull('origin', 'main');
      } catch (err) {
        if (err.message.includes("Couldn't find remote ref")) {
          return { success: true, changes: 0, message: 'リモートにまだコミットがありません' };
        }
        throw err;
      }

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

          const { body } = frontmatter.parse(syncContent);

          const localContent = fs.existsSync(localFilePath)
            ? fs.readFileSync(localFilePath, 'utf-8')
            : null;

          if (localContent !== body) {
            fs.writeFileSync(localFilePath, body, 'utf-8');
            changes++;
          }
        }
      }

      // Phase 3: Track deleted files
      const syncAccountDir = path.join(syncDir, accountId);
      if (fs.existsSync(syncAccountDir) && fs.existsSync(articlesDir)) {
        const remoteFiles = new Set();
        for (const dir of Object.values(STATUS_DIR_MAP)) {
          const dirPath = path.join(syncAccountDir, dir);
          if (!fs.existsSync(dirPath)) continue;
          fs.readdirSync(dirPath).filter(f => f.endsWith('.md')).forEach(f => remoteFiles.add(f));
        }
        const localFiles = fs.readdirSync(articlesDir).filter(f => f.endsWith('.md'));
        for (const localFile of localFiles) {
          if (remoteFiles.size > 0 && !remoteFiles.has(localFile)) {
            // File was deleted on remote - remove locally
            fs.unlinkSync(path.join(articlesDir, localFile));
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

      await this._ensureMainBranch(git);

      // Remove .github/ from tracking to avoid workflow scope errors
      await this._removeGithubFromTracking(git, syncDir);

      try {
        await git.pull('origin', 'main');
      } catch {
        // Ignore if remote is empty
      }

      const articlesDir = this._getArticlesDir(accountId);
      if (!fs.existsSync(articlesDir)) {
        return { success: true, pushed: 0, pulled: 0 };
      }

      // Phase 3: Track changed files only
      const localFiles = fs.readdirSync(articlesDir).filter(f => f.endsWith('.md'));
      const localFileSet = new Set(localFiles);
      let pushed = 0;

      // Remove files from sync dir that were deleted locally (use git rm)
      for (const dir of Object.values(STATUS_DIR_MAP)) {
        const dirPath = path.join(syncDir, accountId, dir);
        if (!fs.existsSync(dirPath)) continue;
        for (const file of fs.readdirSync(dirPath).filter(f => f.endsWith('.md'))) {
          if (!localFileSet.has(file)) {
            const relPath = path.join(accountId, dir, file);
            try {
              await git.raw(['rm', '-f', relPath]);
            } catch {
              // Not tracked — just delete from filesystem
              fs.unlinkSync(path.join(dirPath, file));
            }
            pushed++;
          }
        }
      }

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

        const existing = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf-8') : null;
        if (existing !== articleWithFm) {
          // Remove from other directories first
          for (const dir of Object.values(STATUS_DIR_MAP)) {
            if (dir === statusDir) continue;
            const oldPath = path.join(syncDir, accountId, dir, file);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          }
          fs.writeFileSync(targetPath, articleWithFm, 'utf-8');
          pushed++;
        }
      }

      // Also sync .rewrite-config.yml
      await this._syncRewriteConfig(syncDir);

      await git.add([accountId, '.rewrite-config.yml']);
      const statusResult = await git.status();
      if (!statusResult.isClean()) {
        await git.commit(`[auto] 同期 - ${accountId} (${pushed}件)`);
        try {
          await git.push('origin', 'main');
        } catch {
          await git.push(['-u', 'origin', 'main']);
        }
      }

      const pullResult = await this._pullToLocal(accountId, syncDir, articlesDir);

      this._lastSyncTime = new Date().toISOString();
      return { success: true, pushed, pulled: pullResult.changes };
    } finally {
      this._syncing = false;
    }
  }

  /**
   * Full sync with PR creation: push articles to edit branch and create PR.
   * Articles go to the edit branch only (not main) so the PR has a diff.
   * When the user merges the PR, articles land on main.
   */
  async syncWithPR(accountId) {
    if (this._syncing) return { skipped: true, reason: 'sync in progress' };

    try {
      this._syncing = true;
      await this.init();
      const git = await this._getGit();
      const syncDir = await this._getSyncDir();

      await this._ensureMainBranch(git);

      // Remove .github/ from tracking to avoid workflow scope errors
      await this._removeGithubFromTracking(git, syncDir);

      // Pull main first to get current state
      try {
        await git.pull('origin', 'main');
      } catch { /* empty repo */ }

      const articlesDir = this._getArticlesDir(accountId);
      if (!fs.existsSync(articlesDir)) {
        return { success: true, pushed: 0, pulled: 0, pr: null };
      }

      // Create or checkout edit branch from main
      const today = new Date().toISOString().split('T')[0];
      const branchName = `edit/${accountId}/${today}`;

      const branches = await git.branchLocal();
      if (branches.all.includes(branchName)) {
        await git.checkout(branchName);
        try { await git.merge(['main']); } catch { /* ignore */ }
      } else {
        await git.checkoutLocalBranch(branchName);
      }

      // Copy local articles to sync dir (on edit branch)
      const localFiles = fs.readdirSync(articlesDir).filter(f => f.endsWith('.md'));
      const localFileSet = new Set(localFiles);
      let pushed = 0;

      // Remove files from sync dir that were deleted locally (use git rm)
      for (const dir of Object.values(STATUS_DIR_MAP)) {
        const dirPath = path.join(syncDir, accountId, dir);
        if (!fs.existsSync(dirPath)) continue;
        for (const file of fs.readdirSync(dirPath).filter(f => f.endsWith('.md'))) {
          if (!localFileSet.has(file)) {
            const relPath = path.join(accountId, dir, file);
            try {
              await git.raw(['rm', '-f', relPath]);
            } catch {
              fs.unlinkSync(path.join(dirPath, file));
            }
            pushed++;
          }
        }
      }

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

        const existing = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf-8') : null;
        if (existing !== articleWithFm) {
          for (const dir of Object.values(STATUS_DIR_MAP)) {
            if (dir === statusDir) continue;
            const oldPath = path.join(syncDir, accountId, dir, file);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          }
          fs.writeFileSync(targetPath, articleWithFm, 'utf-8');
          pushed++;
        }
      }

      // Sync config
      await this._syncRewriteConfig(syncDir);

      // Commit on the edit branch
      await git.add([accountId, '.rewrite-config.yml']);
      const branchStatus = await git.status();
      if (!branchStatus.isClean()) {
        await git.commit(`[auto] 同期 - ${accountId} (${pushed}件)`);
      }

      // Push the edit branch
      try {
        await git.push('origin', branchName);
      } catch {
        await git.push(['-u', 'origin', branchName]);
      }

      // Create PR (edit branch → main, so there's a diff)
      const pr = await this._ensurePR(accountId, branchName, today);

      // Go back to main
      await git.checkout('main');

      this._lastSyncTime = new Date().toISOString();
      return { success: true, pushed, pulled: 0, pr };
    } finally {
      this._syncing = false;
    }
  }

  // ─── Phase 3: Improved conflict resolution ───

  /**
   * Ensure we are on the main branch safely.
   */
  async _ensureMainBranch(git) {
    try {
      const branches = await git.branchLocal();
      if (branches.current !== 'main') {
        if (branches.all.includes('main')) {
          await git.checkout('main');
        } else {
          // No main branch yet (fresh repo), create it
          try {
            await git.checkout(['-b', 'main']);
          } catch {
            // Already on main or just initialized
          }
        }
      }
    } catch {
      // Fresh repo - nothing to do
    }
  }

  /**
   * Remove .github/ from git tracking to avoid workflow scope errors on push.
   * Also adds .github/ to .gitignore.
   */
  async _removeGithubFromTracking(git, syncDir) {
    try {
      // Add .github/ to .gitignore if not already there
      const gitignorePath = path.join(syncDir, '.gitignore');
      let gitignore = '';
      if (fs.existsSync(gitignorePath)) {
        gitignore = fs.readFileSync(gitignorePath, 'utf-8');
      }
      if (!gitignore.includes('.github/')) {
        gitignore = gitignore.trimEnd() + '\n.github/\n';
        fs.writeFileSync(gitignorePath, gitignore, 'utf-8');
      }

      // Remove .github from git index if tracked
      try {
        await git.raw(['rm', '--cached', '-r', '.github']);
      } catch {
        // Not tracked - that's fine
      }

      // Commit if there are changes
      await git.add('.gitignore');
      const status = await git.status();
      if (!status.isClean()) {
        await git.commit('[auto] .github/ を git 追跡から除外（workflow スコープ不要に）');
        try {
          await git.push('origin', 'main');
        } catch {
          await git.push(['-u', 'origin', 'main']);
        }
      }
    } catch (err) {
      console.error('[github-sync] _removeGithubFromTracking error:', err.message);
    }
  }

  /**
   * Pull with conflict resolution: GitHub side wins (respects mobile edits).
   */
  async pullWithConflictResolution(accountId) {
    if (this._syncing) return { skipped: true, reason: 'sync in progress' };

    try {
      this._syncing = true;
      await this.init();
      const git = await this._getGit();
      const syncDir = await this._getSyncDir();

      await this._ensureMainBranch(git);

      try {
        await git.pull('origin', 'main');
      } catch (pullErr) {
        if (pullErr.message.includes("Couldn't find remote ref")) {
          return { success: true, changes: 0, conflicts: 0 };
        }
        // Conflict detected - resolve by accepting remote (theirs)
        if (pullErr.message.includes('CONFLICT') || pullErr.message.includes('Merge conflict')) {
          console.log('[github-sync] Conflict detected, accepting remote changes');
          try {
            await git.raw(['checkout', '--theirs', '.']);
            await git.add('.');
            await git.commit('[auto] 競合解決: GitHub側の変更を優先');
          } catch (resolveErr) {
            // If merge resolution fails, abort and try reset
            try { await git.merge(['--abort']); } catch { /* ignore */ }
            await git.reset(['--hard', 'origin/main']);
          }
        } else {
          throw pullErr;
        }
      }

      const articlesDir = this._getArticlesDir(accountId);
      if (!fs.existsSync(articlesDir)) {
        fs.mkdirSync(articlesDir, { recursive: true });
      }

      const pullResult = this._pullToLocal(accountId, syncDir, articlesDir);

      this._lastSyncTime = new Date().toISOString();
      return { success: true, changes: pullResult.changes };
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

module.exports = { GitHubSync, githubSync, STATUS_DIR_MAP, DIR_STATUS_MAP };
