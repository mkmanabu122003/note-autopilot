const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const config = require('../utils/config');

const SYSTEM_PROMPT = `あなたはnoteで有料記事を販売するプロのコンテンツライターです。与えられたトピックについて、noteで「売れる」記事を日本語で執筆してください。

## 出力形式
- タイトル行（1行目）
- 空行
- 本文（見出し・段落を適切に使い、読みやすく構成してください）

## 売れる記事の設計原則

売れる記事 = 「私の実績」で信頼 → 「あなたの悩み」に共感 → 「これ使えば解決」のテンプレート

### 記事構成

■ 無料エリア（全体の約30%）— ここで「読みたい」と思わせる

1. 【冒頭】自己紹介＋実績で信頼を取る（3行以内で簡潔に）
2. 【悩み共感】「こんな経験ありませんか？」（箇条書き3〜5個）
   - ターゲット読者の「あるある」を突く具体的な悩み
3. 【この記事で得られること】を明示する
   - 実体験ベースの具体的なノウハウ
   - 現場で即使えるテンプレート・チェックリスト
   - 読者が自分では作れない実用的なツール
4. 【サンプル】無料で1〜2個のコンテンツを公開し、品質を示す
   ※ここで「残りも読みたい」と思わせる。共感されやすいものを選ぶ

────── ✂️ ここから有料 ──────

■ 有料エリア（残り約70%）

5. メインコンテンツ：各項目は以下の構造で統一する
   ❶ 状況（具体的な場面設定。リアルなシチュエーションで臨場感を出す）
   ❷ 問題（何が起きた／何を失敗したか。自分の判断ミス・準備不足を正直に）
   ❸ 相手・周囲の反応（リアルな空気感。「表情が一瞬曇った」レベルのリアリティ）
   ❹ その場での対処（実際に使ったフレーズや行動付き。具体的なセリフ・英語フレーズ等を含む）
   ❺ 以降の対策（再発防止の仕組み化。チェックリストやルーティンに落とし込む）
   ❻ この経験から得た「武器」（失敗がきっかけで生まれた独自のサービスや工夫）
   ※各項目がこの構造で統一されていると、読者は「自分も同じフレームワークで振り返りができる」と感じ、保存価値が上がる

6. 有料パートの差別化ポイント（＝お金を払う理由）として以下を含める：
   A. 現場で即使えるフレーズ集・テンプレート（読者が自分では作れないもの）
   B. チェックリスト（印刷してそのまま使えるレベルの実用性）
   C. 失敗→成功に変えたリカバリー事例（「失敗しても挽回できる」証拠）

7. 【締め】ポジティブなメッセージ＋次のアクション誘導

## 絶対に守るべきルール

1. **人物像の一貫性**：トピックで設定された人物の実際の業務形態・専門分野に即した内容にすること。業務形態とズレた描写（例：プライベートツアーガイドなのに団体バスツアーの話を書く等）は絶対にNG
2. **具体性**：Google検索の1ページ目に出てくるような一般論は書かない。「現場でしか分からない、教科書に載っていないリアル」を書く
3. **実用性**：読者が「コピペで使える」テンプレート・リスト・フレーズ集を必ず含める。お金を払って読む価値を担保する
4. **トーン**：ポジティブで読者を励ます方向性。暗すぎる表現（「泣いた」「殴りたい」「刺さっている」等）は避け、前向きなエネルギーを伝える
5. **対処法のレベル**：「予備電池を持つ」「笑顔を忘れない」「前日に電話する」のような常識レベルの対処法だけで終わらせない。プロならではの深い知見・仕組み化されたノウハウを示す
6. **失敗ネタの選び方**：その職種・業務形態ならではの失敗を選ぶ。誰でも想像できるありきたりな失敗（集合場所間違い、雨の日プランなし等）ではなく、実際にその仕事をしている人だからこそ起きるリアルな失敗を書く

## タイトルの付け方
- 【保存版】【テンプレ付き】などの実用性を示すタグを活用
- 具体的な数字を入れる（例：「1000人案内して作った」「10選」）
- 読者が得られる価値を明示する
- 例：「【保存版】現役○○が△△して作った"□□マニュアル"：テンプレ付き」

文字数は3000〜5000文字程度を目安にしてください。`;

function getDataDir() {
  try {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'data');
  } catch {
    return path.join(__dirname, '..', '..', 'data');
  }
}

function buildArticlePath(accountId, topic) {
  const sanitized = topic.replace(/[\/\\?%*:|"<>]/g, '_').substring(0, 50);
  const timestamp = Date.now();
  return path.join(getDataDir(), 'accounts', accountId, 'articles', `${sanitized}_${timestamp}.md`);
}

async function callClaude(apiKey, model, topic, extra, writingGuidelines, regenerateInstructions) {
  const client = new Anthropic({ apiKey });
  let systemPrompt = SYSTEM_PROMPT;
  if (writingGuidelines) {
    systemPrompt += `\n\n## ライティングガイドライン\n以下のガイドラインに必ず従って執筆してください：\n${writingGuidelines}`;
  }
  let userPrompt = `次のトピックについて記事を書いてください：${topic}`;
  if (extra) {
    userPrompt += `\n\n追加指示：${extra}`;
  }
  if (regenerateInstructions) {
    userPrompt += `\n\n## 再生成の修正指示\n前回生成した記事に対して以下の修正を反映してください：\n${regenerateInstructions}`;
  }
  const message = await client.messages.create({
    model,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });
  return message.content[0].text;
}

class Generator {
  constructor() {
    const { SheetManager } = require('../utils/csv-manager');
    this.sm = new SheetManager();
  }

  async _getApiConfig() {
    const apiKey = await config.get('api.anthropic_key');
    if (!apiKey) throw new Error('Anthropic APIキーが設定されていません');
    const VALID_MODELS = ['claude-sonnet-4-5-20250929', 'claude-opus-4-6', 'claude-haiku-4-5-20251001'];
    const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
    let model = await config.get('api.generation_model');
    if (!model || !VALID_MODELS.includes(model)) {
      model = DEFAULT_MODEL;
      // Auto-fix the saved config
      await config.set('api.generation_model', model).catch(() => {});
    }
    const writingGuidelines = await config.get('article.writing_guidelines') || '';
    return { apiKey, model, writingGuidelines };
  }

  // Immediate: generate a single topic
  async runSingle(accountId, topicId, regenerateInstructions) {
    const { apiKey, model, writingGuidelines } = await this._getApiConfig();
    const topics = await this.sm.readTopics(accountId);
    const topic = topics.find((t) => t.id === topicId);
    if (!topic) throw new Error(`トピックID ${topicId} が見つかりません`);

    // Update status to generating
    await this.sm.updateTopicStatus(accountId, topicId, 'generating');

    try {
      const articleText = await callClaude(apiKey, model, topic.theme, topic.additional_instructions, writingGuidelines, regenerateInstructions);

      // Save article
      const articlePath = buildArticlePath(accountId, topic.theme);
      const articleDir = path.dirname(articlePath);
      if (!fs.existsSync(articleDir)) {
        fs.mkdirSync(articleDir, { recursive: true });
      }
      fs.writeFileSync(articlePath, articleText, 'utf-8');

      // Update status to generated
      await this.sm.updateTopicStatus(accountId, topicId, 'generated');

      // Parse title from first line
      const lines = articleText.split('\n');
      const title = (lines[0] || '').replace(/^#+\s*/, '').trim();
      const filename = path.basename(articlePath);

      // Auto-push to GitHub if enabled
      try {
        const githubEnabled = await config.get('github.enabled');
        if (githubEnabled) {
          const { githubSync } = require('../utils/github-sync');
          await githubSync.pushArticle(accountId, filename, 'generated', {
            topic_id: topicId,
            pillar: topic.pillar || '',
          });
        }
      } catch (e) {
        console.error('[generator] GitHub push failed (non-blocking):', e.message);
      }

      return {
        success: true,
        article: {
          id: `${topicId}_${Date.now()}`,
          topicId,
          title,
          theme: topic.theme,
          body: articleText,
          articlePath,
          status: 'generated',
          created_at: new Date().toISOString(),
        },
      };
    } catch (err) {
      await this.sm.updateTopicStatus(accountId, topicId, 'error').catch(() => {});
      throw err;
    }
  }

  // Batch: generate all pending topics
  async run(accountId) {
    const { apiKey, model, writingGuidelines } = await this._getApiConfig();
    const topics = await this.sm.readTopics(accountId);
    const pending = topics.filter((t) => (t.status || 'pending') === 'pending');

    if (pending.length === 0) {
      return { generated: 0, errors: 0, results: [] };
    }

    const results = [];
    for (const topic of pending) {
      try {
        await this.sm.updateTopicStatus(accountId, topic.id, 'generating');

        const articleText = await callClaude(apiKey, model, topic.theme, topic.additional_instructions, writingGuidelines);

        const articlePath = buildArticlePath(accountId, topic.theme);
        const articleDir = path.dirname(articlePath);
        if (!fs.existsSync(articleDir)) {
          fs.mkdirSync(articleDir, { recursive: true });
        }
        fs.writeFileSync(articlePath, articleText, 'utf-8');

        await this.sm.updateTopicStatus(accountId, topic.id, 'generated');

        // Auto-push to GitHub if enabled
        try {
          const githubEnabled = await config.get('github.enabled');
          if (githubEnabled) {
            const { githubSync } = require('../utils/github-sync');
            await githubSync.pushArticle(accountId, path.basename(articlePath), 'generated', {
              topic_id: topic.id,
              pillar: topic.pillar || '',
            });
          }
        } catch (e) {
          console.error('[generator:batch] GitHub push failed (non-blocking):', e.message);
        }

        results.push({ topic: topic.theme, topicId: topic.id, status: 'success', articlePath });
      } catch (err) {
        await this.sm.updateTopicStatus(accountId, topic.id, 'error').catch(() => {});
        results.push({ topic: topic.theme, topicId: topic.id, status: 'error', error: err.message });
      }
    }

    return {
      generated: results.filter((r) => r.status === 'success').length,
      errors: results.filter((r) => r.status === 'error').length,
      results,
    };
  }
}

module.exports = { Generator, SYSTEM_PROMPT, buildArticlePath, callClaude };
