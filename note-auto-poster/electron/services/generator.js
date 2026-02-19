const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../utils/config');
const sheetsManager = require('../utils/sheets-manager');

const SYSTEM_PROMPT = `あなたはプロのライターです。与えられたトピックについて、noteに投稿するための記事を日本語で執筆してください。
記事は以下の形式で出力してください：
- タイトル行（1行目）
- 空行
- 本文（見出し・段落を適切に使い、読みやすく構成してください）

文字数は2000〜4000文字程度を目安にしてください。`;

function buildArticlePath(dataDir, accountName, topic) {
  const sanitized = topic.replace(/[\/\\?%*:|"<>]/g, '_').substring(0, 50);
  const timestamp = Date.now();
  return path.join(dataDir, 'accounts', accountName, 'articles', `${sanitized}_${timestamp}.md`);
}

async function generateArticle(client, topic) {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `次のトピックについて記事を書いてください：${topic}` }],
  });

  return message.content[0].text;
}

async function generateArticles(accountName = 'tokken', deps = {}) {
  const config = deps.config || loadConfig();
  const STATUS = sheetsManager.STATUS;

  const auth = deps.auth || await sheetsManager.authenticate(config.sheets.credentialsPath);
  const sheets = deps.sheets || sheetsManager.getSheetsClient(auth);
  const { spreadsheetId, sheetName } = config.sheets;

  const getPending = deps.getPendingTopics || sheetsManager.getPendingTopics;
  const updateStatus = deps.updateTopicStatus || sheetsManager.updateTopicStatus;

  const pendingTopics = await getPending(sheets, spreadsheetId, sheetName);

  if (pendingTopics.length === 0) {
    return { generated: 0, errors: 0, results: [] };
  }

  const client = deps.client || new Anthropic({ apiKey: config.anthropicApiKey });

  const results = [];

  for (const topicRow of pendingTopics) {
    try {
      await updateStatus(sheets, spreadsheetId, sheetName, topicRow.rowIndex, STATUS.GENERATING);

      const articleText = await generateArticle(client, topicRow.topic);

      const articlePath = buildArticlePath(config.dataDir, accountName, topicRow.topic);
      const articleDir = path.dirname(articlePath);
      if (!fs.existsSync(articleDir)) {
        fs.mkdirSync(articleDir, { recursive: true });
      }
      fs.writeFileSync(articlePath, articleText, 'utf-8');

      await updateStatus(sheets, spreadsheetId, sheetName, topicRow.rowIndex, STATUS.GENERATED, articlePath);

      results.push({ topic: topicRow.topic, status: 'success', articlePath });
    } catch (err) {
      await updateStatus(sheets, spreadsheetId, sheetName, topicRow.rowIndex, STATUS.ERROR).catch(() => {});
      results.push({ topic: topicRow.topic, status: 'error', error: err.message });
    }
  }

  return {
    generated: results.filter((r) => r.status === 'success').length,
    errors: results.filter((r) => r.status === 'error').length,
    results,
  };
}

module.exports = { generateArticles, generateArticle, buildArticlePath, SYSTEM_PROMPT };
