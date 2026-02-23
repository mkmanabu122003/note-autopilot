/**
 * /rewrite command parser for GitHub Actions.
 *
 * Parses PR comment commands and outputs GitHub Actions step outputs.
 *
 * Supported patterns:
 *   /rewrite [instruction]                 - Rewrite all changed files
 *   /rewrite filename.md [instruction]     - Rewrite specific file
 *   /rewrite L10-L25 [instruction]         - Rewrite line range
 *   /rewrite 「quoted text」[instruction]  - Rewrite quoted section
 *   /rewrite undo                          - Revert last rewrite
 *   /rewrite diff [instruction]            - Preview diff without committing
 *   /rewrite apply                         - Batch apply all /rewrite review comments
 */

const fs = require('fs');
const path = require('path');

const comment = process.env.COMMENT_BODY || process.argv[2] || '';
const branch = process.env.PR_BRANCH || process.argv[3] || '';

function setOutput(key, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    fs.appendFileSync(outputFile, `${key}=${value}\n`);
  }
  console.log(`::set-output name=${key}::${value}`);
}

function parse(comment) {
  const body = comment.trim();

  if (!body.startsWith('/rewrite')) {
    return { action: 'none' };
  }

  const rest = body.slice('/rewrite'.length).trim();

  // /rewrite undo
  if (rest === 'undo') {
    return { action: 'undo' };
  }

  // /rewrite apply - batch apply review comments
  if (rest === 'apply') {
    return { action: 'apply' };
  }

  // /rewrite diff [instruction]
  if (rest.startsWith('diff')) {
    const diffInstruction = rest.slice('diff'.length).trim();
    const parsed = parseTargetAndInstruction(diffInstruction);
    return { action: 'diff', ...parsed };
  }

  // Regular rewrite
  const parsed = parseTargetAndInstruction(rest);
  return { action: 'rewrite', ...parsed };
}

function parseTargetAndInstruction(text) {
  if (!text) {
    return { targetFile: '', lineStart: '', lineEnd: '', quoteText: '', instruction: '' };
  }

  // Pattern: L10-L25 [instruction]
  const lineMatch = text.match(/^L(\d+)-L(\d+)\s*(.*)/s);
  if (lineMatch) {
    return {
      targetFile: '',
      lineStart: lineMatch[1],
      lineEnd: lineMatch[2],
      quoteText: '',
      instruction: lineMatch[3].trim(),
    };
  }

  // Pattern: 「quoted text」[instruction]
  const quoteMatch = text.match(/^「([^」]+)」\s*(.*)/s);
  if (quoteMatch) {
    return {
      targetFile: '',
      lineStart: '',
      lineEnd: '',
      quoteText: quoteMatch[1],
      instruction: quoteMatch[2].trim(),
    };
  }

  // Pattern: filename.md [instruction]
  const fileMatch = text.match(/^(\S+\.md)\s*(.*)/s);
  if (fileMatch) {
    return {
      targetFile: fileMatch[1],
      lineStart: '',
      lineEnd: '',
      quoteText: '',
      instruction: fileMatch[2].trim(),
    };
  }

  // Default: instruction only (apply to all changed files)
  return {
    targetFile: '',
    lineStart: '',
    lineEnd: '',
    quoteText: '',
    instruction: text.trim(),
  };
}

// Find the target file(s) in the repository
function findTargetFiles(targetFile) {
  const files = [];

  function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.')) continue;
        walkDir(fullPath);
      } else if (entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }

  if (targetFile) {
    // Search for the specific file
    walkDir(process.cwd());
    const matches = files.filter(f =>
      path.basename(f) === targetFile ||
      f.endsWith(targetFile)
    );
    return matches;
  }

  // No specific file - find all .md files (excluding dotfiles)
  walkDir(process.cwd());
  return files.filter(f => !f.includes('/.') && !f.includes('node_modules'));
}

// Main
const result = parse(comment);

setOutput('action', result.action);
setOutput('target_file', result.targetFile || '');
setOutput('line_start', result.lineStart || '');
setOutput('line_end', result.lineEnd || '');
setOutput('quote_text', result.quoteText || '');
setOutput('instruction', result.instruction || '');

// If we have a target file, verify it exists
if (result.targetFile) {
  const found = findTargetFiles(result.targetFile);
  if (found.length === 0) {
    console.log(`::warning::ファイル "${result.targetFile}" が見つかりません`);

    // List available .md files as suggestions
    const allFiles = findTargetFiles('');
    if (allFiles.length > 0) {
      console.log('利用可能なファイル:');
      allFiles.forEach(f => console.log(`  - ${path.relative(process.cwd(), f)}`));
    }
  } else {
    setOutput('resolved_file', path.relative(process.cwd(), found[0]));
  }
}

console.log('Parsed command:', JSON.stringify(result, null, 2));
