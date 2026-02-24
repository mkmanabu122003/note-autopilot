/**
 * Review Session Manager
 *
 * 記事のレビューセッションを管理し、指示を蓄積してから一括実行する。
 * 各トピック（Telegram forum topic）ごとに1セッションを持つ。
 *
 * ライフサイクル:
 *   idle → collecting（構造マップ送信後、指示受付開始）
 *       → executing（/done で一括リライト実行中）
 *       → done（完了。追加修正 or 承認待ち）
 *       → collecting（/retry で再度指示受付）
 */

const logger = require('../utils/logger');

class ReviewSession {
  /**
   * @param {string} accountId
   * @param {string} filename
   * @param {number} topicId - Telegram forum topic ID
   * @param {object} structureMap - Phase 0 で生成した構造マップ
   */
  constructor(accountId, filename, topicId, structureMap) {
    this.accountId = accountId;
    this.filename = filename;
    this.topicId = topicId;
    this.structureMap = structureMap;
    this.state = 'collecting';
    this.instructions = [];
    this.history = []; // 過去のリライト履歴
    this.createdAt = new Date();
    this.model = null; // null = デフォルト（Sonnet）
  }

  /**
   * 指示を追加する
   * @param {string} raw - ユーザーの生テキスト（例: "S4 具体例追加"）
   * @returns {object} パースされた指示
   */
  addInstruction(raw) {
    if (this.state !== 'collecting') {
      throw new Error(`現在のセッション状態（${this.state}）では指示を追加できません`);
    }

    const parsed = parseInstruction(raw, this.structureMap);
    this.instructions.push(parsed);
    return parsed;
  }

  /**
   * 最後の指示を取り消す
   * @returns {object|null} 取り消された指示
   */
  undoLast() {
    if (this.instructions.length === 0) return null;
    return this.instructions.pop();
  }

  /**
   * 全指示をクリアする
   */
  clearInstructions() {
    this.instructions = [];
  }

  /**
   * 実行開始（状態遷移）
   * @param {string} [model] - 使用モデル（opus/sonnet/null=デフォルト）
   */
  startExecution(model) {
    if (this.instructions.length === 0) {
      throw new Error('指示がありません。先にセクション指定で指示を追加してください。');
    }
    this.state = 'executing';
    this.model = model || null;
  }

  /**
   * 実行完了
   * @param {object} result - リライト結果
   */
  completeExecution(result) {
    this.history.push({
      instructions: [...this.instructions],
      model: this.model,
      result,
      executedAt: new Date(),
    });
    this.instructions = [];
    this.state = 'done';
  }

  /**
   * 追加修正モードに戻る
   */
  retry() {
    if (this.state === 'executing') {
      throw new Error('実行中はretryできません。完了をお待ちください。');
    }
    this.state = 'collecting';
  }

  /**
   * セッション情報のサマリーを取得
   */
  getSummary() {
    return {
      state: this.state,
      instructionCount: this.instructions.length,
      historyCount: this.history.length,
      model: this.model,
      instructions: this.instructions.map(i => i.display),
    };
  }
}

/**
 * ユーザー入力をパースして構造化された指示にする
 *
 * 対応フォーマット:
 *   "S4 具体例を追加"         → セクション4 への指示
 *   "S6 500字以内にして"      → セクション6 への指示
 *   "全体 もっとカジュアルに"  → 記事全体への指示
 *   "具体例を追加"            → セクション指定なし（全体扱い）
 *
 * @param {string} raw
 * @param {object} structureMap
 * @returns {object} { targetSection, instruction, display }
 */
function parseInstruction(raw, structureMap) {
  const text = raw.trim();

  // S + 数字 パターン
  const sectionMatch = text.match(/^[Ss](\d+)\s+(.+)/s);
  if (sectionMatch) {
    const sectionNum = parseInt(sectionMatch[1], 10);
    const sectionId = `S${sectionNum}`;
    const instruction = sectionMatch[2].trim();

    // 構造マップからセクション情報を取得
    const section = structureMap?.sections?.find(s => s.id === sectionId);
    const sectionTitle = section ? section.title : `セクション${sectionNum}`;

    return {
      targetSection: sectionId,
      sectionTitle,
      lineStart: section?.lineStart || null,
      lineEnd: section?.lineEnd || null,
      instruction,
      display: `${sectionId}（${sectionTitle}）: ${instruction}`,
    };
  }

  // 「全体」パターン
  const globalMatch = text.match(/^(全体|全文|overall)\s+(.+)/si);
  if (globalMatch) {
    return {
      targetSection: null,
      sectionTitle: '全体',
      lineStart: null,
      lineEnd: null,
      instruction: globalMatch[2].trim(),
      display: `全体: ${globalMatch[2].trim()}`,
    };
  }

  // セクション指定なし → 全体扱い
  return {
    targetSection: null,
    sectionTitle: '全体',
    lineStart: null,
    lineEnd: null,
    instruction: text,
    display: `全体: ${text}`,
  };
}


/**
 * 複数セッションを管理するマネージャー
 * topicId をキーにセッションを保持する
 */
class ReviewSessionManager {
  constructor() {
    this.sessions = new Map(); // topicId → ReviewSession
  }

  /**
   * セッションを作成（既存があれば上書き）
   */
  create(accountId, filename, topicId, structureMap) {
    const session = new ReviewSession(accountId, filename, topicId, structureMap);
    this.sessions.set(topicId, session);
    logger.info('review-session:create', `topic ${topicId}, file: ${filename}`);
    return session;
  }

  /**
   * セッションを取得
   */
  get(topicId) {
    return this.sessions.get(topicId) || null;
  }

  /**
   * セッションを削除
   */
  remove(topicId) {
    this.sessions.delete(topicId);
  }

  /**
   * 全セッションのサマリー
   */
  getAllSummaries() {
    const result = {};
    for (const [topicId, session] of this.sessions) {
      result[topicId] = session.getSummary();
    }
    return result;
  }
}

// Singleton
const reviewSessionManager = new ReviewSessionManager();

module.exports = { ReviewSession, ReviewSessionManager, reviewSessionManager, parseInstruction };
