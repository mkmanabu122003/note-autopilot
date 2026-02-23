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
 *   BATCH_FILE        - JSON file with array of {file, lineStart, lineEnd, instruction} (for /rewrite apply)
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

  const batchFile = process.env.BATCH_FILE || '';
  const isDryRun = process.env.DRY_RUN === 'true';

  // Load rewrite config
  let config = {};
  const configPath = path.join(process.cwd(), '.rewrite-config.yml');
  if (fs.existsSync(configPath)) {
    config = parseSimpleYaml(fs.readFileSync(configPath, 'utf-8'));
  }

  const model = config.model || 'claude-sonnet-4-5-20250929';
  const client = new Anthropic({ apiKey });

  // Build system prompt with config
  let systemPrompt = SYSTEM_PROMPT;
  if (config.writing_guidelines) {
    systemPrompt += `\n\n## ライティングガイドライン\n${config.writing_guidelines}`;
  }
  if (config.additional_prompt) {
    systemPrompt += `\n\n${config.additional_prompt}`;
  }

  // Batch mode: process multiple edits from review comments
  if (batchFile && fs.existsSync(batchFile)) {
    const edits = JSON.parse(fs.readFileSync(batchFile, 'utf-8'));
    await processBatch(client, model, systemPrompt, edits, isDryRun);
    return;
  }

  // Single mode
  const targetFile = process.env.TARGET_FILE || '';
  const lineStart = parseInt(process.env.LINE_START || '0', 10);
  const lineEnd = parseInt(process.env.LINE_END || '0', 10);
  const quoteText = process.env.QUOTE_TEXT || '';
  const instruction = process.env.INSTRUCTION || '';

  if (!instruction) {
    setOutput('success', 'false');
    console.error('リライト指示がありません');
    process.exit(1);
  }

  const files = findFiles(targetFile);
  if (files.length === 0) {
    setOutput('success', 'false');
    console.error('対象ファイルが見つかりません');
    process.exit(1);
  }

  let totalChanges = 0;
  const summaryParts = [];
  const diffParts = [];

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
      // Adjust line numbers if they include frontmatter lines
      const fmLineCount = fmPart ? fmPart.split('\n').length - 1 : 0;
      const adjStart = lineStart > fmLineCount ? lineStart - fmLineCount : lineStart;
      const adjEnd = lineEnd > fmLineCount ? lineEnd - fmLineCount : lineEnd;

      const lines = bodyPart.split('\n');
      const startIdx = adjStart - 1;
      const endIdx = Math.min(adjEnd, lines.length);
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
        const diff = generateDiff(bodyPart, newBody, relPath);
        diffParts.push(diff);
      } else {
        fs.writeFileSync(filePath, newContent, 'utf-8');
      }

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

/**
 * Batch processing: apply multiple review comment edits at once.
 * Each edit is processed sequentially on the file to avoid conflicts.
 * Groups edits by file, sorts by line number (descending) so edits don't shift line numbers.
 */
async function processBatch(client, model, systemPrompt, edits, isDryRun) {
  // Group edits by file
  const editsByFile = {};
  for (const edit of edits) {
    const key = edit.file;
    if (!editsByFile[key]) editsByFile[key] = [];
    editsByFile[key].push(edit);
  }

  let totalChanges = 0;
  const summaryParts = [];

  for (const [filePath, fileEdits] of Object.entries(editsByFile)) {
    let absPath = path.join(process.cwd(), filePath);
    if (!fs.existsSync(absPath)) {
      // Fallback: search by basename (handles Unicode normalization differences
      // between GitHub API paths and filesystem paths)
      const basename = path.basename(filePath);
      const found = findFiles(basename);
      if (found.length > 0) {
        absPath = found[0];
        console.log(`パス不一致のため検索で解決: ${filePath} → ${path.relative(process.cwd(), absPath)}`);
      } else {
        console.error(`ファイルが見つかりません: ${filePath}`);
        // List available files for debugging
        const allFiles = findFiles('');
        if (allFiles.length > 0) {
          console.error('リポジトリ内のファイル:');
          allFiles.forEach(f => console.error(`  - ${path.relative(process.cwd(), f)}`));
        }
        summaryParts.push(`- **${filePath}**: ファイルが見つかりません`);
        continue;
      }
    }

    let content = fs.readFileSync(absPath, 'utf-8');
    const fmMatch = content.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
    const fmPart = fmMatch ? fmMatch[1] : '';
    let bodyPart = fmMatch ? fmMatch[2] : content;
    const fmLineCount = fmPart ? fmPart.split('\n').length - 1 : 0;

    // Sort edits by line number descending so later edits don't shift earlier ones
    fileEdits.sort((a, b) => (b.lineStart || 0) - (a.lineStart || 0));

    let editCount = 0;
    for (const edit of fileEdits) {
      const lineStart = edit.lineStart || 0;
      const lineEnd = edit.lineEnd || 0;

      if (lineStart <= 0 || lineEnd <= 0) {
        console.log(`行番号が不正です (${lineStart}-${lineEnd}): スキップ`);
        continue;
      }

      // Adjust for frontmatter
      const adjStart = lineStart > fmLineCount ? lineStart - fmLineCount : lineStart;
      const adjEnd = lineEnd > fmLineCount ? lineEnd - fmLineCount : lineEnd;

      const lines = bodyPart.split('\n');
      const startIdx = adjStart - 1;
      const endIdx = Math.min(adjEnd, lines.length);
      const prefix = lines.slice(0, startIdx).join('\n');
      const targetContent = lines.slice(startIdx, endIdx).join('\n');
      const suffix = lines.slice(endIdx).join('\n');

      const userPrompt = buildUserPrompt(targetContent, edit.instruction, filePath, lineStart, lineEnd, '');

      console.log(`リライト中: ${filePath} L${lineStart}-L${lineEnd} "${edit.instruction}"...`);

      try {
        const message = await client.messages.create({
          model,
          max_tokens: 8192,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        });

        const rewritten = message.content[0].text;
        bodyPart = prefix + (prefix.endsWith('\n') ? '' : '\n') + rewritten + (suffix.startsWith('\n') ? '' : '\n') + suffix;
        editCount++;
      } catch (err) {
        console.error(`${filePath} L${lineStart}-L${lineEnd} のリライトに失敗: ${err.message}`);
        summaryParts.push(`- **${filePath}** L${lineStart}-L${lineEnd}: エラー - ${err.message}`);
      }
    }

    if (editCount > 0) {
      const newContent = fmPart + bodyPart;
      if (!isDryRun) {
        fs.writeFileSync(absPath, newContent, 'utf-8');
      }

      const oldContent = fs.readFileSync(absPath, 'utf-8');
      const changed = countDiffLines(fmPart ? content.slice(fmPart.length) : content, bodyPart);
      totalChanges += changed;
      summaryParts.push(`- **${filePath}**: ${editCount}箇所リライト（約${changed}行変更）`);
    }
  }

  const summary = [
    `### 一括リライト サマリー`,
    `対象: ${edits.length}箇所（${Object.keys(editsByFile).length}ファイル）`,
    `変更行数: 約${totalChanges}行`,
    '',
    ...summaryParts,
  ].join('\n');

  fs.writeFileSync('/tmp/rewrite-summary.md', summary, 'utf-8');
  const hasChanges = totalChanges > 0;
  setOutput('success', hasChanges ? 'true' : 'false');
  setOutput('changes', String(totalChanges));
  console.log('一括リライト完了:', summary);
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
