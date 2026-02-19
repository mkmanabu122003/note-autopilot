import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Google Sheets API モック関数
const mockGet = vi.fn();
const mockUpdate = vi.fn();
const mockAppend = vi.fn();

// テスト用のモック Google API
const mockGoogle = {
  auth: {
    GoogleAuth: class {
      constructor() {}
    },
  },
  sheets: () => ({
    spreadsheets: {
      values: {
        get: mockGet,
        update: mockUpdate,
        append: mockAppend,
      },
    },
  }),
};

// テスト用のモック設定
const mockConfig = {
  get: vi.fn((key) => {
    if (key === 'api.google_service_account_key_path') return '/tmp/test-key.json';
    return null;
  }),
  getAccount: vi.fn(() => ({
    sheets: { spreadsheet_id: 'test-sheet-id', sheet_name: 'topics' },
  })),
  set: vi.fn(),
};

// テスト用のモックロガー
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// サービスアカウントキーファイルのモック & 依存注入
beforeEach(async () => {
  vi.clearAllMocks();

  // テスト用キーファイル作成
  if (!fs.existsSync('/tmp/test-key.json')) {
    fs.writeFileSync('/tmp/test-key.json', JSON.stringify({ type: 'service_account' }));
  }

  // mockConfig のデフォルト実装を再設定（clearAllMocks でリセットされるため）
  mockConfig.get.mockImplementation((key) => {
    if (key === 'api.google_service_account_key_path') return '/tmp/test-key.json';
    return null;
  });
  mockConfig.getAccount.mockImplementation(() => ({
    sheets: { spreadsheet_id: 'test-sheet-id', sheet_name: 'topics' },
  }));

  // sheet-manager にテスト用の依存を注入
  const sheetManager = await import('../sheet-manager.js');
  sheetManager.default._setTestDeps({
    config: mockConfig,
    logger: mockLogger,
    google: mockGoogle,
  });
});

describe('sheet-manager', () => {
  describe('rowToObject / objectToRow', () => {
    it('行データをオブジェクトに正しく変換する', async () => {
      const { _internal } = await import('../sheet-manager.js');
      const row = ['1', 'テストテーマ', 'kw1 kw2', '指示', 'guide_business', 'TRUE', '3000', '0.3', 'pending', '2026-02-19T00:00:00Z'];
      const obj = _internal.rowToObject(row);

      expect(obj.id).toBe(1);
      expect(typeof obj.id).toBe('number');
      expect(obj.theme).toBe('テストテーマ');
      expect(obj.is_paid).toBe(true);
      expect(obj.price).toBe(3000);
      expect(obj.free_preview_ratio).toBe(0.3);
      expect(obj.status).toBe('pending');
    });

    it('FALSEをbooleanに変換する', async () => {
      const { _internal } = await import('../sheet-manager.js');
      const row = ['2', 'テーマB', '', '', 'culture_branding', 'FALSE', '0', '1.0', 'pending', ''];
      const obj = _internal.rowToObject(row);
      expect(obj.is_paid).toBe(false);
    });

    it('空カラムをデフォルト値で処理する', async () => {
      const { _internal } = await import('../sheet-manager.js');
      const row = ['3', 'テーマC']; // 残りのカラムが欠落
      const obj = _internal.rowToObject(row);
      expect(obj.id).toBe(3);
      expect(obj.keywords).toBe('');
      expect(obj.price).toBe(0);
      expect(obj.is_paid).toBe(false);
    });

    it('オブジェクトを行データに変換できる', async () => {
      const { _internal } = await import('../sheet-manager.js');
      const obj = {
        id: 1, theme: 'テスト', keywords: 'kw', additional_instructions: '',
        pillar: 'guide_ai', is_paid: true, price: 2000, free_preview_ratio: 0.3,
        status: 'pending', updated_at: '2026-02-19T00:00:00Z',
      };
      const row = _internal.objectToRow(obj);
      expect(row[0]).toBe(1);
      expect(row[5]).toBe('TRUE');
      expect(row.length).toBe(_internal.COLUMNS.length);
    });
  });

  describe('readTopics', () => {
    it('Sheets APIからデータを取得してオブジェクト配列を返す', async () => {
      mockGet.mockResolvedValue({
        data: {
          values: [
            ['1', 'テーマA', 'kw1', '', 'guide_business', 'TRUE', '3000', '0.3', 'pending', ''],
            ['2', 'テーマB', 'kw2', '', 'culture_branding', 'FALSE', '0', '1.0', 'pending', ''],
          ],
        },
      });

      const sheetManager = await import('../sheet-manager.js');
      const topics = await sheetManager.default.readTopics('tokken');

      expect(topics).toHaveLength(2);
      expect(topics[0].theme).toBe('テーマA');
      expect(topics[1].is_paid).toBe(false);
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    it('API失敗時にキャッシュから読む', async () => {
      mockGet.mockRejectedValue(new Error('Network error'));

      // キャッシュを事前に書き込み
      const cacheDir = path.join(__dirname, '../../../data/accounts/tokken');
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(
        path.join(cacheDir, 'topics-cache.json'),
        JSON.stringify({
          topics: [{ id: 1, theme: 'キャッシュテーマ', status: 'pending' }],
          cached_at: '2026-02-19T00:00:00Z',
        })
      );

      const sheetManager = await import('../sheet-manager.js');
      const topics = await sheetManager.default.readTopics('tokken');
      expect(topics).toHaveLength(1);
      expect(topics[0].theme).toBe('キャッシュテーマ');

      // クリーンアップ
      fs.rmSync(path.join(cacheDir, 'topics-cache.json'), { force: true });
    });

    it('空のシートは空配列を返す', async () => {
      mockGet.mockResolvedValue({ data: { values: [] } });

      const sheetManager = await import('../sheet-manager.js');
      const topics = await sheetManager.default.readTopics('tokken');
      expect(topics).toEqual([]);
    });
  });

  describe('readTopicsByStatus', () => {
    it('指定ステータスのみ返す', async () => {
      mockGet.mockResolvedValue({
        data: {
          values: [
            ['1', 'A', '', '', 'guide_business', 'TRUE', '3000', '0.3', 'pending', ''],
            ['2', 'B', '', '', 'guide_ai', 'TRUE', '2000', '0.3', 'generated', ''],
            ['3', 'C', '', '', 'culture_branding', 'FALSE', '0', '1.0', 'pending', ''],
          ],
        },
      });

      const sheetManager = await import('../sheet-manager.js');
      const topics = await sheetManager.default.readTopicsByStatus('tokken', 'pending');
      expect(topics).toHaveLength(2);
      expect(topics.every((t) => t.status === 'pending')).toBe(true);
    });
  });

  describe('updateStatus', () => {
    it('Sheets APIのupdate が正しい範囲で呼ばれる', async () => {
      mockGet.mockResolvedValue({
        data: {
          values: [
            ['1', 'A', '', '', 'guide_business', 'TRUE', '3000', '0.3', 'pending', ''],
            ['2', 'B', '', '', 'guide_ai', 'TRUE', '2000', '0.3', 'pending', ''],
          ],
        },
      });
      mockUpdate.mockResolvedValue({});

      const sheetManager = await import('../sheet-manager.js');
      const result = await sheetManager.default.updateStatus('tokken', 2, 'generating');

      expect(result.status).toBe('generating');
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          range: 'topics!I3:J3', // ID=2 は2行目(0-indexed=1) → シート行番号=3
          requestBody: { values: [['generating', expect.any(String)]] },
        })
      );
    });

    it('存在しないIDはエラーを投げる', async () => {
      mockGet.mockResolvedValue({
        data: { values: [['1', 'A', '', '', '', '', '', '', 'pending', '']] },
      });

      const sheetManager = await import('../sheet-manager.js');
      await expect(
        sheetManager.default.updateStatus('tokken', 999, 'generating')
      ).rejects.toThrow('Topic 999 not found');
    });
  });

  describe('addTopic', () => {
    it('Sheets APIのappendが呼ばれ、新しいIDが採番される', async () => {
      mockGet.mockResolvedValue({
        data: {
          values: [
            ['1', 'A', '', '', 'guide_business', 'TRUE', '3000', '0.3', 'pending', ''],
            ['2', 'B', '', '', 'guide_ai', 'TRUE', '2000', '0.3', 'pending', ''],
          ],
        },
      });
      mockAppend.mockResolvedValue({});

      const sheetManager = await import('../sheet-manager.js');
      const newTopic = await sheetManager.default.addTopic('tokken', {
        theme: '新テーマ', pillar: 'guide_business', is_paid: true, price: 1500,
      });

      expect(newTopic.id).toBe(3); // max(1,2) + 1
      expect(newTopic.status).toBe('pending');
      expect(mockAppend).toHaveBeenCalledTimes(1);
    });
  });
});
