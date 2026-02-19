// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const { generateArticles, generateArticle, buildArticlePath } = await import('../generator.js');
const { STATUS } = await import('../../utils/sheets-manager.js');

describe('generator', () => {
  let tmpDir;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeDeps(overrides = {}) {
    return {
      config: {
        anthropicApiKey: 'test-api-key',
        sheets: {
          spreadsheetId: 'test-spreadsheet-id',
          sheetName: 'topics',
          credentialsPath: '/path/to/creds.json',
        },
        dataDir: tmpDir,
      },
      auth: {},
      sheets: {},
      client: {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: '記事内容' }],
          }),
        },
      },
      getPendingTopics: vi.fn().mockResolvedValue([]),
      updateTopicStatus: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  describe('buildArticlePath', () => {
    it('正しいパスを生成する', () => {
      const result = buildArticlePath('/data', 'tokken', 'AIの基礎');
      expect(result).toContain(path.join('/data', 'accounts', 'tokken', 'articles'));
      expect(result).toContain('AIの基礎');
      expect(result).toMatch(/\.md$/);
    });

    it('ファイル名の不正文字を置換する', () => {
      const result = buildArticlePath('/data', 'tokken', 'test/file?name');
      expect(result).not.toContain('/file');
      expect(result).not.toContain('?');
    });
  });

  describe('generateArticle', () => {
    it('Claude API を呼び出して記事テキストを返す', async () => {
      const createMock = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'テスト記事の内容です。' }],
      });
      const mockClient = { messages: { create: createMock } };

      const result = await generateArticle(mockClient, 'AI入門');

      expect(result).toBe('テスト記事の内容です。');
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 4096,
          messages: [{ role: 'user', content: expect.stringContaining('AI入門') }],
        }),
      );
    });
  });

  describe('generateArticles', () => {
    it('pending トピックがない場合は何もしない', async () => {
      const deps = makeDeps();

      const result = await generateArticles('tokken', deps);

      expect(result).toEqual({ generated: 0, errors: 0, results: [] });
      expect(deps.client.messages.create).not.toHaveBeenCalled();
    });

    it('pending トピックの記事を生成しファイルに保存する', async () => {
      const deps = makeDeps({
        getPendingTopics: vi.fn().mockResolvedValue([
          { rowIndex: 2, topic: 'AI入門', status: 'pending', articlePath: '' },
        ]),
      });
      deps.client.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: '# AI入門\n\nAIの記事です。' }],
      });

      const result = await generateArticles('tokken', deps);

      expect(result.generated).toBe(1);
      expect(result.errors).toBe(0);
      expect(result.results[0].status).toBe('success');

      const articlePath = result.results[0].articlePath;
      expect(fs.existsSync(articlePath)).toBe(true);
      expect(fs.readFileSync(articlePath, 'utf-8')).toBe('# AI入門\n\nAIの記事です。');
    });

    it('ステータスが pending → generating → generated の順に更新される', async () => {
      const deps = makeDeps({
        getPendingTopics: vi.fn().mockResolvedValue([
          { rowIndex: 2, topic: 'テスト', status: 'pending', articlePath: '' },
        ]),
      });

      await generateArticles('tokken', deps);

      expect(deps.updateTopicStatus).toHaveBeenNthCalledWith(
        1,
        {}, 'test-spreadsheet-id', 'topics', 2, STATUS.GENERATING,
      );
      expect(deps.updateTopicStatus).toHaveBeenNthCalledWith(
        2,
        {}, 'test-spreadsheet-id', 'topics', 2, STATUS.GENERATED, expect.stringContaining('.md'),
      );
    });

    it('API エラー時にステータスを error に更新する', async () => {
      const deps = makeDeps({
        getPendingTopics: vi.fn().mockResolvedValue([
          { rowIndex: 2, topic: 'エラーテスト', status: 'pending', articlePath: '' },
        ]),
      });
      deps.client.messages.create.mockRejectedValue(new Error('API rate limit exceeded'));

      const result = await generateArticles('tokken', deps);

      expect(result.generated).toBe(0);
      expect(result.errors).toBe(1);
      expect(result.results[0].error).toBe('API rate limit exceeded');
      expect(deps.updateTopicStatus).toHaveBeenCalledWith(
        {}, 'test-spreadsheet-id', 'topics', 2, STATUS.ERROR,
      );
    });

    it('複数トピックを順番に処理する', async () => {
      const deps = makeDeps({
        getPendingTopics: vi.fn().mockResolvedValue([
          { rowIndex: 2, topic: 'トピック1', status: 'pending', articlePath: '' },
          { rowIndex: 3, topic: 'トピック2', status: 'pending', articlePath: '' },
        ]),
      });

      const result = await generateArticles('tokken', deps);

      expect(result.generated).toBe(2);
      expect(result.errors).toBe(0);
      expect(deps.updateTopicStatus).toHaveBeenCalledTimes(4);
    });
  });
});
