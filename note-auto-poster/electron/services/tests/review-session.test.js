import { describe, it, expect, beforeEach } from 'vitest';
import { ReviewSession, ReviewSessionManager, parseInstruction } from '../review-session';

describe('parseInstruction', () => {
  const structureMap = {
    sections: [
      { id: 'S1', title: '冒頭', lineStart: 1, lineEnd: 15 },
      { id: 'S4', title: '無料サンプル', lineStart: 41, lineEnd: 65 },
      { id: 'S6', title: 'プロンプト設計', lineStart: 96, lineEnd: 130 },
    ],
  };

  it('S + 数字のパターンをパースする', () => {
    const result = parseInstruction('S4 具体例を追加', structureMap);
    expect(result.targetSection).toBe('S4');
    expect(result.sectionTitle).toBe('無料サンプル');
    expect(result.instruction).toBe('具体例を追加');
    expect(result.lineStart).toBe(41);
    expect(result.lineEnd).toBe(65);
  });

  it('小文字のsでもパースできる', () => {
    const result = parseInstruction('s6 500字以内にして', structureMap);
    expect(result.targetSection).toBe('S6');
    expect(result.instruction).toBe('500字以内にして');
  });

  it('構造マップにないセクションも受け付ける', () => {
    const result = parseInstruction('S99 テスト', structureMap);
    expect(result.targetSection).toBe('S99');
    expect(result.sectionTitle).toBe('セクション99');
    expect(result.lineStart).toBeNull();
  });

  it('「全体」パターンをパースする', () => {
    const result = parseInstruction('全体 もっとカジュアルに', structureMap);
    expect(result.targetSection).toBeNull();
    expect(result.sectionTitle).toBe('全体');
    expect(result.instruction).toBe('もっとカジュアルに');
  });

  it('セクション指定なしは全体扱い', () => {
    const result = parseInstruction('文体を統一して', structureMap);
    expect(result.targetSection).toBeNull();
    expect(result.instruction).toBe('文体を統一して');
  });
});

describe('ReviewSession', () => {
  let session;
  const structureMap = {
    sections: [
      { id: 'S1', title: '冒頭', lineStart: 1, lineEnd: 15 },
      { id: 'S4', title: '無料サンプル', lineStart: 41, lineEnd: 65 },
    ],
  };

  beforeEach(() => {
    session = new ReviewSession('acc1', 'test.md', 12345, structureMap);
  });

  it('初期状態は collecting', () => {
    expect(session.state).toBe('collecting');
    expect(session.instructions).toHaveLength(0);
  });

  it('指示を追加できる', () => {
    session.addInstruction('S4 具体例追加');
    session.addInstruction('S1 もっと短く');
    expect(session.instructions).toHaveLength(2);
    expect(session.instructions[0].targetSection).toBe('S4');
    expect(session.instructions[1].targetSection).toBe('S1');
  });

  it('最後の指示を取り消せる', () => {
    session.addInstruction('S4 具体例追加');
    session.addInstruction('S1 もっと短く');
    const removed = session.undoLast();
    expect(removed.targetSection).toBe('S1');
    expect(session.instructions).toHaveLength(1);
  });

  it('空の場合の undo は null', () => {
    expect(session.undoLast()).toBeNull();
  });

  it('全指示をクリアできる', () => {
    session.addInstruction('S4 具体例追加');
    session.addInstruction('S1 もっと短く');
    session.clearInstructions();
    expect(session.instructions).toHaveLength(0);
  });

  it('executing 状態では指示を追加できない', () => {
    session.addInstruction('S4 具体例追加');
    session.startExecution();
    expect(() => session.addInstruction('S1 テスト')).toThrow();
  });

  it('指示なしで実行開始はエラー', () => {
    expect(() => session.startExecution()).toThrow('指示がありません');
  });

  it('状態遷移: collecting → executing → done → collecting', () => {
    session.addInstruction('S4 具体例追加');

    session.startExecution('opus');
    expect(session.state).toBe('executing');
    expect(session.model).toBe('opus');

    session.completeExecution({ rewrittenContent: 'test' });
    expect(session.state).toBe('done');
    expect(session.history).toHaveLength(1);
    expect(session.instructions).toHaveLength(0);

    session.retry();
    expect(session.state).toBe('collecting');
  });

  it('サマリーを取得できる', () => {
    session.addInstruction('S4 具体例追加');
    const summary = session.getSummary();
    expect(summary.state).toBe('collecting');
    expect(summary.instructionCount).toBe(1);
    expect(summary.instructions).toHaveLength(1);
  });
});

describe('ReviewSessionManager', () => {
  let manager;

  beforeEach(() => {
    manager = new ReviewSessionManager();
  });

  it('セッションを作成・取得できる', () => {
    const session = manager.create('acc1', 'test.md', 111, null);
    expect(manager.get(111)).toBe(session);
  });

  it('存在しないセッションは null', () => {
    expect(manager.get(999)).toBeNull();
  });

  it('セッションを削除できる', () => {
    manager.create('acc1', 'test.md', 111, null);
    manager.remove(111);
    expect(manager.get(111)).toBeNull();
  });

  it('全セッションのサマリーを取得できる', () => {
    manager.create('acc1', 'file1.md', 111, null);
    manager.create('acc2', 'file2.md', 222, null);
    const summaries = manager.getAllSummaries();
    expect(Object.keys(summaries)).toHaveLength(2);
  });
});
