/**
 * AI Rewrite Script for GitHub Actions.
 *
 * Reads target article(s), calls Claude API to rewrite, and writes the result.
 * Supports: full file, line range, and quoted text targeting.
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY - Claude API key
 *   TARGET_FILE       - Specific file to rewrite (optional)
 *   LINE_START        - Start line for range rewrite (optional)
 *   LINE_END          - End line for range rewrite (optional)
 *   QUOTE_TEXT        - Quoted text to find and rewrite (optional)
 *   INSTRUCTION       - Rewrite instruction
 *   DRY_RUN           - If "true", output diff without writing (for /rewrite diff)
 */

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = `あなたはnoteで有料記事を販売するプロのコンテンツライターです。
記事のリライト（書き直し）を行います。

## ルール
- 元の記事の構成と主張を維持しつつ、指示された箇所のみを改善してください
- <!-- paid-line --> の位置は変更しないでください
- frontmatter（---で囲まれた部分）は変更しないでください
- マークダウン記法を適切に使用してください
- 指示がない箇所は変更しないでください`;

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    setOutput('success', 'false');
    console.error('ANTHROPIC_API_KEY が設定されていません');
    process.exit(1);
  }

  const targetFile = process.env.TARGET_FILE || '';
  const lineStart = parseInt(process.env.LINE_START || '0', 10);
  const lineEnd = parseInt(process.env.LINE_END || '0', 10);
  const quoteText = process.env.QUOTE_TEXT || '';
  const instruction = process.env.INSTRUCTION || '';
  const isDryRun = process.env.DRY_RUN === 'true';

  if (!instruction) {
    setOutput('success', 'false');
    console.error('リライト指示がありません');
    process.exit(1);
  }

  // Load rewrite config
  let config = {};
  const configPath = path.join(process.cwd(), '.rewrite-config.yml');
  if (fs.existsSync(configPath)) {
    config = parseSimpleYaml(fs.readFileSync(configPath, 'utf-8'));
  }

  const model = config.model || 'claude-sonnet-4-5-20250929';

  // Find target files
  const files = findFiles(targetFile);
  if (files.length === 0) {
    setOutput('success', 'false');
    console.error('対象ファイルが見つかりません');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });
  let totalChanges = 0;
  const summaryParts = [];
  const diffParts = [];

  // Build system prompt with config
  let systemPrompt = SYSTEM_PROMPT;
  if (config.writing_guidelines) {
    systemPrompt += `\n\n## ライティングガイドライン\n${config.writing_guidelines}`;
  }
  if (config.additional_prompt) {
    systemPrompt += `\n\n${config.additional_prompt}`;
  }

  for (const filePath of files) {
    const relPath = path.relative(process.cwd(), filePath);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Separate frontmatter
    const fmMatch = content.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
    const fmPart = fmMatch ? fmMatch[1] : '';
    const bodyPart = fmMatch ? fmMatch[2] : content;

    let targetContent = bodyPart;
    let prefix = '';
    let suffix = '';

    // Line range targeting
    if (lineStart > 0 && lineEnd > 0) {
      const lines = bodyPart.split('\n');
      const startIdx = lineStart - 1;
      const endIdx = Math.min(lineEnd, lines.length);
      prefix = lines.slice(0, startIdx).join('\n');
      targetContent = lines.slice(startIdx, endIdx).join('\n');
      suffix = lines.slice(endIdx).join('\n');
    }
    // Quoted text targeting
    else if (quoteText) {
      const idx = bodyPart.indexOf(quoteText);
      if (idx === -1) {
        console.log(`"${quoteText}" が ${relPath} に見つかりません。スキップします。`);
        continue;
      }
      prefix = bodyPart.substring(0, idx);
      targetContent = quoteText;
      suffix = bodyPart.substring(idx + quoteText.length);
    }

    // Call Claude API
    const userPrompt = buildUserPrompt(targetContent, instruction, relPath, lineStart, lineEnd, quoteText);

    console.log(`リライト中: ${relPath}...`);

    try {
      const message = await client.messages.create({
        model,
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const rewritten = message.content[0].text;

      // Reconstruct the file
      let newBody;
      if (lineStart > 0 || quoteText) {
        newBody = prefix + (prefix.endsWith('\n') ? '' : '\n') + rewritten + (suffix.startsWith('\n') ? '' : '\n') + suffix;
      } else {
        newBody = rewritten;
      }

      const newContent = fmPart + newBody;

      if (isDryRun) {
        // Generate diff for preview
        const diff = generateDiff(bodyPart, newBody, relPath);
        diffParts.push(diff);
      } else {
        fs.writeFileSync(filePath, newContent, 'utf-8');
      }

      // Count changed lines
      const oldLines = bodyPart.split('\n').length;
      const newLines = newBody.split('\n').length;
      const changed = Math.abs(newLines - oldLines) + countDiffLines(bodyPart, newBody);
      totalChanges += changed;

      summaryParts.push(`- **${relPath}**: ${changed}行変更`);
    } catch (err) {
      console.error(`${relPath} のリライトに失敗: ${err.message}`);
      summaryParts.push(`- **${relPath}**: エラー - ${err.message}`);
    }
  }

  // Write summary
  const summary = [
    `### 変更サマリー`,
    `対象ファイル: ${files.length}件`,
    `変更行数: 約${totalChanges}行`,
    '',
    ...summaryParts,
  ].join('\n');

  fs.writeFileSync('/tmp/rewrite-summary.md', summary, 'utf-8');

  if (isDryRun && diffParts.length > 0) {
    const diffContent = diffParts.join('\n\n---\n\n');
    fs.writeFileSync('/tmp/rewrite-diff.md', diffContent, 'utf-8');
  }

  setOutput('success', 'true');
  setOutput('changes', String(totalChanges));
  console.log('リライト完了:', summary);
}

function buildUserPrompt(content, instruction, filePath, lineStart, lineEnd, quoteText) {
  let prompt = `以下の記事`;

  if (lineStart > 0 && lineEnd > 0) {
    prompt += `（${lineStart}行目〜${lineEnd}行目）`;
  } else if (quoteText) {
    prompt += `の「${quoteText}」の部分`;
  }

  prompt += `を指示に従ってリライトしてください。\n\n`;
  prompt += `## ファイル: ${filePath}\n\n`;
  prompt += `## リライト指示\n${instruction}\n\n`;
  prompt += `## 対象テキスト\n\`\`\`markdown\n${content}\n\`\`\`\n\n`;
  prompt += `リライト後のテキストのみを返してください（\`\`\`マークダウンの囲みは不要です）。`;

  return prompt;
}

function findFiles(targetFile) {
  const files = [];

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        walk(full);
      } else if (entry.name.endsWith('.md')) {
        files.push(full);
      }
    }
  }

  walk(process.cwd());

  if (targetFile) {
    return files.filter(f =>
      path.basename(f) === targetFile ||
      f.endsWith(targetFile) ||
      path.relative(process.cwd(), f) === targetFile
    );
  }

  // Return all article .md files (exclude config/readme)
  return files.filter(f => {
    const rel = path.relative(process.cwd(), f);
    return !rel.startsWith('.') &&
           !rel.toLowerCase().includes('readme') &&
           !rel.toLowerCase().includes('config');
  });
}

function generateDiff(oldText, newText, filePath) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const diffLines = [`### ${filePath}`, '```diff'];

  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];
    if (oldLine === undefined) {
      diffLines.push(`+ ${newLine}`);
    } else if (newLine === undefined) {
      diffLines.push(`- ${oldLine}`);
    } else if (oldLine !== newLine) {
      diffLines.push(`- ${oldLine}`);
      diffLines.push(`+ ${newLine}`);
    }
  }
  diffLines.push('```');
  return diffLines.join('\n');
}

function countDiffLines(oldText, newText) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  let diff = 0;
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    if (oldLines[i] !== newLines[i]) diff++;
  }
  return diff;
}

function parseSimpleYaml(text) {
  const result = {};
  let currentKey = null;
  let multilineValue = [];
  let inMultiline = false;

  for (const line of text.split('\n')) {
    if (line.startsWith('#') || line.trim() === '') {
      if (inMultiline) multilineValue.push('');
      continue;
    }

    if (!line.startsWith(' ') && !line.startsWith('\t') && line.includes(':')) {
      // Save previous multiline
      if (inMultiline && currentKey) {
        result[currentKey] = multilineValue.join('\n').trim();
      }

      const colonIdx = line.indexOf(':');
      currentKey = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();

      if (value === '|') {
        inMultiline = true;
        multilineValue = [];
      } else {
        inMultiline = false;
        result[currentKey] = value;
      }
    } else if (inMultiline) {
      multilineValue.push(line.replace(/^ {2}/, ''));
    }
  }

  if (inMultiline && currentKey) {
    result[currentKey] = multilineValue.join('\n').trim();
  }

  return result;
}

function setOutput(key, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    fs.appendFileSync(outputFile, `${key}=${value}\n`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  setOutput('success', 'false');
  process.exit(1);
});
