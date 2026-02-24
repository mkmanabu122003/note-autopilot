/**
 * Structure Map Generator
 *
 * 記事の構造を分析し、セクションごとの品質マップを生成する。
 * Haiku で低コスト（1回 ≈ $0.004）に俯瞰情報を提供。
 */

const Anthropic = require('@anthropic-ai/sdk');
const config = require('../utils/config');
const frontmatter = require('../utils/frontmatter');
const logger = require('../utils/logger');

const STRUCTURE_MAP_PROMPT = `あなたは記事の構造分析アシスタントです。
与えられた記事を分析し、以下のJSON形式で構造マップを返してください。

## 出力形式（JSONのみ、余計な説明不要）

{
  "sections": [
    {
      "id": "S1",
      "title": "セクション見出し",
      "lineStart": 1,
      "lineEnd": 15,
      "charCount": 320,
      "type": "intro|empathy|value_prop|free_sample|paid_content|closing|other",
      "quality": "good|warning|issue",
      "qualityNote": "品質に関する短いコメント（1文）"
    }
  ],
  "overall": {
    "totalChars": 3480,
    "freeRatio": 30,
    "paidRatio": 70,
    "readability": "good|warning|issue",
    "readabilityNote": "読みやすさに関するコメント",
    "salesPower": "good|warning|issue",
    "salesPowerNote": "販売力に関するコメント",
    "suggestions": ["改善提案1", "改善提案2"]
  }
}

## 分析観点

### 読みやすさ
- 文章の流れが自然か
- 冗長な箇所はないか
- 読者が離脱しそうなポイントはないか

### 販売力
- 無料部分で「続きを読みたい」と思わせる構成か
- 有料部分に課金に値する価値（テンプレ、チェックリスト等）があるか
- 購入動機を喚起する要素があるか

JSONのみを返してください。`;

/**
 * 記事の構造マップを生成する
 * @param {string} articleBody - 記事本文（frontmatter除去済み）
 * @returns {object} 構造マップオブジェクト
 */
async function generateStructureMap(articleBody) {
  const apiKey = await config.get('api.anthropic_key');
  if (!apiKey) throw new Error('Anthropic APIキーが設定されていません');

  const model = 'claude-haiku-4-5-20251001';
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model,
    max_tokens: 2048,
    system: STRUCTURE_MAP_PROMPT,
    messages: [{
      role: 'user',
      content: `以下の記事を分析してください：\n\n${articleBody}`,
    }],
  });

  const text = message.content[0].text;

  // JSONを抽出（```json ... ``` で囲まれている場合にも対応）
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('構造マップのパースに失敗しました');
  }

  return JSON.parse(jsonMatch[0]);
}

/**
 * 構造マップをTelegram用テキストに整形する
 * @param {string} title - 記事タイトル
 * @param {object} map - generateStructureMap の返り値
 * @returns {string} Telegram HTML 形式のテキスト
 */
function formatForTelegram(title, map) {
  const statusIcon = (quality) => {
    if (quality === 'good') return '\u2705';
    if (quality === 'warning') return '\u26a0\ufe0f';
    return '\u274c';
  };

  const lines = [];
  lines.push(`<b>\ud83d\udcca \u69cb\u9020\u30de\u30c3\u30d7: ${escapeHtml(title)}</b>`);
  lines.push('');

  let paidLineShown = false;
  for (const s of map.sections) {
    if (!paidLineShown && s.type === 'paid_content') {
      lines.push('\u2500\u2500 \u2702\ufe0f \u3053\u3053\u304b\u3089\u6709\u6599 \u2500\u2500');
      paidLineShown = true;
    }
    const icon = statusIcon(s.quality);
    const note = s.quality !== 'good' && s.qualityNote ? ` - ${escapeHtml(s.qualityNote)}` : '';
    lines.push(`${icon} <b>${escapeHtml(s.id)}</b> ${escapeHtml(s.title)} (${s.charCount}\u5b57)${note}`);
  }

  lines.push('');
  lines.push(`<b>\u5168\u4f53:</b> ${map.overall.totalChars}\u5b57 | \u7121\u6599${map.overall.freeRatio}%:\u6709\u6599${map.overall.paidRatio}%`);

  const rIcon = statusIcon(map.overall.readability);
  const sIcon = statusIcon(map.overall.salesPower);
  lines.push(`${rIcon} \u8aad\u307f\u3084\u3059\u3055: ${escapeHtml(map.overall.readabilityNote)}`);
  lines.push(`${sIcon} \u8ca9\u58f2\u529b: ${escapeHtml(map.overall.salesPowerNote)}`);

  if (map.overall.suggestions && map.overall.suggestions.length > 0) {
    lines.push('');
    lines.push('<b>\ud83d\udca1 \u6539\u5584\u63d0\u6848:</b>');
    for (const s of map.overall.suggestions) {
      lines.push(`\u2022 ${escapeHtml(s)}`);
    }
  }

  lines.push('');
  lines.push('\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  lines.push('\u30bb\u30af\u30b7\u30e7\u30f3\u6307\u5b9a\u3067\u6307\u793a\u3092\u51fa\u305b\u307e\u3059:');
  lines.push('<code>S4 \u5177\u4f53\u4f8b\u3092\u8ffd\u52a0</code>');
  lines.push('<code>S6 500\u5b57\u4ee5\u5185\u306b\u3057\u3066</code>');
  lines.push('/done \u3067\u4e00\u62ec\u30ea\u30e9\u30a4\u30c8\u5b9f\u884c');

  return lines.join('\n');
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = { generateStructureMap, formatForTelegram };
