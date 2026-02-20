import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import the CJS module directly — no vi.mock needed since we use _setDepsForTesting
const thumbnailGenerator = await import('../thumbnail-generator.js');
const { formatTitle, getTitleFontSize, PILLAR_CONFIG } = thumbnailGenerator._internal;

// Create mock deps
const mockPage = {
  setViewportSize: vi.fn(),
  setContent: vi.fn(),
  waitForTimeout: vi.fn(),
  screenshot: vi.fn(),
  close: vi.fn(),
};
const mockBrowser = {
  newPage: vi.fn(() => mockPage),
  close: vi.fn(),
};

const mockFs = {
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(),
  copyFileSync: vi.fn(),
};

const mockConfig = {
  getAccount: vi.fn(async () => ({ display_name: 'テスト太郎' })),
};

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe('thumbnail-generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Inject mock deps before each test
    thumbnailGenerator._setDepsForTesting({
      fs: mockFs,
      config: mockConfig,
      logger: mockLogger,
      launchBrowser: () => mockBrowser,
    });
  });

  describe('formatTitle()', () => {
    it('18文字以内のタイトル → 改行なし', () => {
      const result = formatTitle('短いタイトルです');
      expect(result).not.toContain('<br>');
    });

    it('30文字のタイトル → 適切な位置で改行', () => {
      const title = 'これは三十文字のタイトルでテストをしています確認用';
      const result = formatTitle(title);
      expect(result).toContain('<br>');
      const lines = result.split('<br>');
      lines.forEach((line) => {
        expect(line.length).toBeLessThanOrEqual(18);
      });
    });

    it('「：」「】」の後に改行が入る', () => {
      const result1 = formatTitle('ガイド入門：はじめの一歩');
      expect(result1).toContain('：<br>');

      const result2 = formatTitle('【完全版】ツアーガイドの始め方');
      expect(result2).toContain('】<br>');
    });

    it('空文字列 → 空文字列', () => {
      expect(formatTitle('')).toBe('');
    });

    it('nullやundefined → 空文字列', () => {
      expect(formatTitle(null)).toBe('');
      expect(formatTitle(undefined)).toBe('');
    });
  });

  describe('getTitleFontSize()', () => {
    it('15文字 → 60', () => {
      expect(getTitleFontSize('あ'.repeat(15))).toBe(60);
    });

    it('20文字 → 60', () => {
      expect(getTitleFontSize('あ'.repeat(20))).toBe(60);
    });

    it('25文字 → 52', () => {
      expect(getTitleFontSize('あ'.repeat(25))).toBe(52);
    });

    it('40文字 → 44', () => {
      expect(getTitleFontSize('あ'.repeat(40))).toBe(44);
    });

    it('60文字 → 38', () => {
      expect(getTitleFontSize('あ'.repeat(60))).toBe(38);
    });

    it('空文字列 → 60', () => {
      expect(getTitleFontSize('')).toBe(60);
    });
  });

  describe('PILLAR_CONFIG', () => {
    it('guide_business のラベルが "GUIDE BUSINESS"', () => {
      expect(PILLAR_CONFIG.guide_business.label).toBe('GUIDE BUSINESS');
    });

    it('guide_ai のラベルが "AI × GUIDE"', () => {
      expect(PILLAR_CONFIG.guide_ai.label).toBe('AI × GUIDE');
    });

    it('culture_branding のラベルが "日本文化 × 外国人目線"', () => {
      expect(PILLAR_CONFIG.culture_branding.label).toBe('日本文化 × 外国人目線');
    });

    it('各柱にaccentColorとaccentColorLightが定義されている', () => {
      for (const key of Object.keys(PILLAR_CONFIG)) {
        expect(PILLAR_CONFIG[key].accentColor).toBeDefined();
        expect(PILLAR_CONFIG[key].accentColor).toMatch(/^#/);
        expect(PILLAR_CONFIG[key].accentColorLight).toBeDefined();
        expect(PILLAR_CONFIG[key].accentColorLight).toMatch(/^#/);
      }
    });
  });

  describe('generateAll()', () => {
    it('launchBrowser が呼ばれること（6パターン分のnewPage）', async () => {
      mockFs.readFileSync.mockReturnValue('<html>{{TITLE}} {{PILLAR_LABEL}} {{AUTHOR_NAME}} {{ACCENT_COLOR}} {{ACCENT_COLOR_LIGHT}} {{TITLE_FONT_SIZE}}</html>');

      const article = { id: 'test-1', title: 'テスト記事', pillar: 'guide_business' };
      await thumbnailGenerator.generateAll('tokken', article);

      expect(mockBrowser.newPage).toHaveBeenCalledTimes(6);
    });

    it('6回 page.screenshot が呼ばれること', async () => {
      mockFs.readFileSync.mockReturnValue('<html>{{TITLE}}</html>');

      const article = { id: 'test-2', title: 'テスト記事', pillar: 'guide_ai' };
      await thumbnailGenerator.generateAll('tokken', article);

      expect(mockPage.screenshot).toHaveBeenCalledTimes(6);
    });

    it('各スクリーンショットのpathが正しいこと', async () => {
      mockFs.readFileSync.mockReturnValue('<html>{{TITLE}}</html>');

      const article = { id: 'test-3', title: 'テスト記事', pillar: 'guide_business' };
      const results = await thumbnailGenerator.generateAll('tokken', article);

      expect(results).toHaveLength(6);
      const patterns = results.map((r) => r.pattern);
      expect(patterns).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);

      for (const r of results) {
        expect(r.path).toContain(`pattern-${r.pattern}.png`);
        expect(r.path).toContain('tokken');
        expect(r.path).toContain('test-3');
      }
    });

    it('テンプレートHTMLのプレースホルダーが置換されていること', async () => {
      const templateContent = '<html>{{TITLE}} {{PILLAR_LABEL}} {{AUTHOR_NAME}} {{ACCENT_COLOR}} {{ACCENT_COLOR_LIGHT}} {{TITLE_FONT_SIZE}}</html>';
      mockFs.readFileSync.mockReturnValue(templateContent);

      const article = { id: 'test-4', title: 'テスト記事のタイトル', pillar: 'guide_business' };
      await thumbnailGenerator.generateAll('tokken', article);

      const setContentCalls = mockPage.setContent.mock.calls;
      expect(setContentCalls.length).toBeGreaterThan(0);
      for (const call of setContentCalls) {
        const html = call[0];
        expect(html).not.toContain('{{TITLE}}');
        expect(html).not.toContain('{{PILLAR_LABEL}}');
        expect(html).not.toContain('{{AUTHOR_NAME}}');
        expect(html).not.toContain('{{ACCENT_COLOR}}');
        expect(html).not.toContain('{{TITLE_FONT_SIZE}}');
        expect(html).toContain('テスト記事のタイトル');
        expect(html).toContain('GUIDE BUSINESS');
        expect(html).toContain('テスト太郎');
      }
    });
  });

  describe('selectThumbnail()', () => {
    it('指定パターンのPNGがselected.pngにコピーされること', () => {
      mockFs.existsSync.mockReturnValue(true);

      const dest = thumbnailGenerator.selectThumbnail('tokken', 'article-1', 'a');

      expect(mockFs.copyFileSync).toHaveBeenCalledTimes(1);
      const [src, target] = mockFs.copyFileSync.mock.calls[0];
      expect(src).toContain('pattern-a.png');
      expect(target).toContain('selected.png');
      expect(dest).toContain('selected.png');
    });

    it('存在しないパターンでエラーが投げられること', () => {
      mockFs.existsSync.mockReturnValue(false);

      expect(() => {
        thumbnailGenerator.selectThumbnail('tokken', 'article-1', 'z');
      }).toThrow(/Thumbnail not found/);
    });
  });

  describe('listThumbnails()', () => {
    it('ディレクトリに6ファイルある場合 → 6件返す', () => {
      mockFs.existsSync.mockReturnValue(true);

      const result = thumbnailGenerator.listThumbnails('tokken', 'article-1');
      expect(result).toHaveLength(6);
      expect(result[0].pattern).toBe('a');
      expect(result[5].pattern).toBe('f');
    });

    it('ディレクトリが存在しない場合 → 空配列', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = thumbnailGenerator.listThumbnails('tokken', 'nonexistent');
      expect(result).toHaveLength(0);
    });
  });
});
