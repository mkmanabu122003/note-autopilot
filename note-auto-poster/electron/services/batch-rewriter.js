/**
 * Batch Rewriter
 *
 * 複数の編集指示を1回のAPI呼び出しで一括実行する。
 * 現状の rewrite.js が編集ごとに個別API呼び出しするのに対し、
 * 全指示を1プロンプトにまとめて送信することでコストを大幅削減。
 *
 * モデル選択:
 *   デフォルト: Sonnet（コスト効率重視）
 *   /done opus: Opus 4.6（最高品質、最終仕上げ向け）
 */

const Anthropic = require('@anthropic-ai/sdk');
const config = require('../utils/config');
const frontmatter = require('../utils/frontmatter');
const logger = require('../utils/logger');

const MODELS = {
  sonnet: 'claude-sonnet-4-5-20250929',
  opus: 'claude-opus-4-6',
  haiku: 'claude-haiku-4-5-20251001',
};

const DEFAULT_MODEL = 'sonnet';

const SYSTEM_PROMPT = `あなたはnoteで有料記事を販売するプロのコンテンツライターです。
記事のリライト（書き直し）を行います。

## ルール
- 元の記事の構成と主張を維持しつつ、指示された箇所のみを改善してください
- <!-- paid-line --> の位置は変更しないでください
- frontmatter（---で囲まれた部分）は変更しないでください
- マークダウン記法を適切に使用してください
- 指示がない箇所は一切変更しないでください
- 複数の指示がある場合、すべてを同時に反映してください
- リライト後の記事全文のみを返してください（説明やコメントは不要）`;

/**
 * 複数の編集指示を1回のAPI呼び出しで一括実行する
 *
 * @param {string} articleContent - 記事全文（frontmatter含む）
 * @param {Array} instructions - パース済み指示の配列
 *   [{ targetSection, sectionTitle, instruction, lineStart, lineEnd }]
 * @param {object} options
 *   @param {string} options.model - 'sonnet' | 'opus' | 'haiku'
 *   @param {string} options.writingGuidelines - ライティングガイドライン
 * @returns {object} { rewrittenContent, summary }
 */
async function batchRewrite(articleContent, instructions, options = {}) {
  const apiKey = await config.get('api.anthropic_key');
  if (!apiKey) throw new Error('Anthropic APIキーが設定されていません');

  const modelKey = options.model || DEFAULT_MODEL;
  const model = MODELS[modelKey] || MODELS[DEFAULT_MODEL];
  const client = new Anthropic({ apiKey });

  // frontmatter を分離
  const { metadata, body } = frontmatter.parse(articleContent);

  // システムプロンプト構築
  let systemPrompt = SYSTEM_PROMPT;
  const writingGuidelines = options.writingGuidelines || await config.get('article.writing_guidelines') || '';
  if (writingGuidelines) {
    systemPrompt += `\n\n## ライティングガイドライン\n${writingGuidelines}`;
  }

  // ユーザープロンプト構築
  const userPrompt = buildUserPrompt(body, instructions);

  logger.info('batch-rewriter', `model=${model}, instructions=${instructions.length}`);

  const message = await client.messages.create({
    model,
    max_tokens: 16384,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  // トランケート検出: 記事が途中で切れるとデータ損失になるため必ずチェック
  if (message.stop_reason === 'max_tokens') {
    throw new Error('リライト結果がトークン上限で切り詰められました。記事が長すぎる可能性があります。');
  }

  const rewrittenBody = message.content[0].text;

  // frontmatter を再結合
  const rewrittenContent = Object.keys(metadata).length > 0
    ? frontmatter.stringify(metadata, rewrittenBody)
    : rewrittenBody;

  // 差分サマリー生成
  const summary = buildSummary(body, rewrittenBody, instructions);

  return {
    rewrittenContent,
    summary,
    usage: {
      model,
      inputTokens: message.usage?.input_tokens || 0,
      outputTokens: message.usage?.output_tokens || 0,
    },
  };
}

/**
 * 全指示を1つのプロンプトにまとめる
 */
function buildUserPrompt(body, instructions) {
  const lines = [];
  lines.push('以下の記事を、指定された複数の編集指示に従って一括リライトしてください。');
  lines.push('すべての指示を同時に反映し、リライト後の記事全文のみを返してください。');
  lines.push('');
  lines.push('## 編集指示');
  lines.push('');

  for (let i = 0; i < instructions.length; i++) {
    const inst = instructions[i];
    const num = i + 1;

    if (inst.targetSection) {
      const lineInfo = inst.lineStart && inst.lineEnd
        ? ` (L${inst.lineStart}-L${inst.lineEnd})`
        : '';
      lines.push(`${num}. **${inst.targetSection}${lineInfo}** ${inst.sectionTitle}: ${inst.instruction}`);
    } else {
      lines.push(`${num}. **全体**: ${inst.instruction}`);
    }
  }

  lines.push('');
  lines.push('## 現在の記事');
  lines.push('');
  lines.push(body);

  return lines.join('\n');
}

/**
 * リライト前後の差分サマリーを生成する
 */
function buildSummary(originalBody, rewrittenBody, instructions) {
  const originalChars = originalBody.length;
  const rewrittenChars = rewrittenBody.length;
  const diff = rewrittenChars - originalChars;
  const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;

  const items = instructions.map(inst => {
    const target = inst.targetSection || '全体';
    return `${target}: ${inst.instruction}`;
  });

  return {
    instructionCount: instructions.length,
    originalChars,
    rewrittenChars,
    charDiff: diffStr,
    items,
  };
}

/**
 * サマリーをTelegram用テキストに整形する
 */
function formatSummaryForTelegram(summary, usage) {
  const lines = [];
  lines.push(`\u2705 <b>\u30ea\u30e9\u30a4\u30c8\u5b8c\u4e86\uff08${summary.instructionCount}\u4ef6\uff09</b>`);
  lines.push('');

  for (const item of summary.items) {
    lines.push(`\u2022 ${escapeHtml(item)}`);
  }

  lines.push('');
  lines.push(`\u6587\u5b57\u6570: ${summary.originalChars} \u2192 ${summary.rewrittenChars} (${summary.charDiff})`);

  if (usage) {
    const modelName = Object.entries(MODELS).find(([, v]) => v === usage.model)?.[0] || usage.model;
    lines.push(`\u30e2\u30c7\u30eb: ${modelName} | \u30c8\u30fc\u30af\u30f3: ${usage.inputTokens + usage.outputTokens}`);
  }

  lines.push('');
  lines.push('/approve \u2192 \u627f\u8a8d');
  lines.push('/retry S6 \u3082\u3046\u5c11\u3057\u5177\u4f53\u7684\u306b \u2192 \u8ffd\u52a0\u4fee\u6b63');

  return lines.join('\n');
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = { batchRewrite, formatSummaryForTelegram, MODELS };
