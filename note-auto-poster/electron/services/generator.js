const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const config = require('../utils/config');

const SYSTEM_PROMPT = `あなたはプロのライターです。与えられたトピックについて、noteに投稿するための記事を日本語で執筆してください。
記事は以下の形式で出力してください：
- タイトル行（1行目）
- 空行
- 本文（見出し・段落を適切に使い、読みやすく構成してください）

文字数は2000〜4000文字程度を目安にしてください。`;

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

async function callClaude(apiKey, model, topic, extra) {
  const client = new Anthropic({ apiKey });
  let userPrompt = `次のトピックについて記事を書いてください：${topic}`;
  if (extra) {
    userPrompt += `\n\n追加指示：${extra}`;
  }
  const message = await client.messages.create({
    model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
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
    return { apiKey, model };
  }

  // Immediate: generate a single topic
  async runSingle(accountId, topicId) {
    const { apiKey, model } = await this._getApiConfig();
    const topics = await this.sm.readTopics(accountId);
    const topic = topics.find((t) => t.id === topicId);
    if (!topic) throw new Error(`トピックID ${topicId} が見つかりません`);

    // Update status to generating
    await this.sm.updateTopicStatus(accountId, topicId, 'generating');

    try {
      const articleText = await callClaude(apiKey, model, topic.theme, topic.additional_instructions);

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

      return {
        success: true,
        article: {
          id: `${topicId}_${Date.now()}`,
          topicId,
          title,
          theme: topic.theme,
          content: articleText,
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
    const { apiKey, model } = await this._getApiConfig();
    const topics = await this.sm.readTopics(accountId);
    const pending = topics.filter((t) => (t.status || 'pending') === 'pending');

    if (pending.length === 0) {
      return { generated: 0, errors: 0, results: [] };
    }

    const results = [];
    for (const topic of pending) {
      try {
        await this.sm.updateTopicStatus(accountId, topic.id, 'generating');

        const articleText = await callClaude(apiKey, model, topic.theme, topic.additional_instructions);

        const articlePath = buildArticlePath(accountId, topic.theme);
        const articleDir = path.dirname(articlePath);
        if (!fs.existsSync(articleDir)) {
          fs.mkdirSync(articleDir, { recursive: true });
        }
        fs.writeFileSync(articlePath, articleText, 'utf-8');

        await this.sm.updateTopicStatus(accountId, topic.id, 'generated');

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
