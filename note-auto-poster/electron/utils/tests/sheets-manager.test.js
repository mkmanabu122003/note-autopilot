// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getTopics, getPendingTopics, updateTopicStatus, STATUS } = await import('../sheets-manager.js');

function makeSheetsMock({ getValues = null, updateResult = {} } = {}) {
  return {
    spreadsheets: {
      values: {
        get: vi.fn().mockResolvedValue({ data: { values: getValues } }),
        update: vi.fn().mockResolvedValue(updateResult),
      },
    },
  };
}

describe('sheets-manager', () => {
  describe('getTopics', () => {
    it('ヘッダ行を除いたトピック一覧を返す', async () => {
      const sheets = makeSheetsMock({
        getValues: [
          ['topic', 'status', 'article_path'],
          ['AI入門', 'pending', ''],
          ['React hooks', 'generated', '/path/to/article.md'],
        ],
      });

      const topics = await getTopics(sheets, 'spreadsheet-id', 'topics');

      expect(topics).toEqual([
        { rowIndex: 2, topic: 'AI入門', status: 'pending', articlePath: '' },
        { rowIndex: 3, topic: 'React hooks', status: 'generated', articlePath: '/path/to/article.md' },
      ]);

      expect(sheets.spreadsheets.values.get).toHaveBeenCalledWith({
        spreadsheetId: 'spreadsheet-id',
        range: 'topics!A:C',
      });
    });

    it('データが空の場合は空配列を返す', async () => {
      const sheets = makeSheetsMock({
        getValues: [['topic', 'status', 'article_path']],
      });

      const topics = await getTopics(sheets, 'spreadsheet-id', 'topics');
      expect(topics).toEqual([]);
    });

    it('values が null の場合は空配列を返す', async () => {
      const sheets = makeSheetsMock({ getValues: null });

      const topics = await getTopics(sheets, 'spreadsheet-id', 'topics');
      expect(topics).toEqual([]);
    });
  });

  describe('getPendingTopics', () => {
    it('ステータスが pending のトピックのみ返す', async () => {
      const sheets = makeSheetsMock({
        getValues: [
          ['topic', 'status', 'article_path'],
          ['AI入門', 'pending', ''],
          ['React hooks', 'generated', '/path/to/article.md'],
          ['TypeScript基礎', 'pending', ''],
        ],
      });

      const pending = await getPendingTopics(sheets, 'spreadsheet-id', 'topics');

      expect(pending).toHaveLength(2);
      expect(pending[0].topic).toBe('AI入門');
      expect(pending[1].topic).toBe('TypeScript基礎');
    });
  });

  describe('updateTopicStatus', () => {
    it('ステータスのみを更新する', async () => {
      const sheets = makeSheetsMock();

      await updateTopicStatus(sheets, 'spreadsheet-id', 'topics', 2, STATUS.GENERATING);

      expect(sheets.spreadsheets.values.update).toHaveBeenCalledWith({
        spreadsheetId: 'spreadsheet-id',
        range: 'topics!B2',
        valueInputOption: 'RAW',
        requestBody: { values: [['generating']] },
      });
    });

    it('ステータスと記事パスを同時に更新する', async () => {
      const sheets = makeSheetsMock();

      await updateTopicStatus(sheets, 'spreadsheet-id', 'topics', 3, STATUS.GENERATED, '/articles/test.md');

      expect(sheets.spreadsheets.values.update).toHaveBeenCalledWith({
        spreadsheetId: 'spreadsheet-id',
        range: 'topics!B3:C3',
        valueInputOption: 'RAW',
        requestBody: { values: [['generated', '/articles/test.md']] },
      });
    });
  });

  describe('STATUS', () => {
    it('必要なステータス定数がすべて定義されている', () => {
      expect(STATUS.PENDING).toBe('pending');
      expect(STATUS.GENERATING).toBe('generating');
      expect(STATUS.GENERATED).toBe('generated');
      expect(STATUS.ERROR).toBe('error');
    });
  });
});
