const { chromium } = require('playwright');
const _fs = require('fs');
const path = require('path');
const _config = require('../utils/config');
const _logger = require('../utils/logger');

// Mutable deps for testing
let deps = { fs: _fs, config: _config, logger: _logger, launchBrowser: () => chromium.launch({ headless: true }) };

const TEMPLATES_DIR = path.join(__dirname, '../templates/thumbnails');
const PATTERNS = ['a', 'b', 'c', 'd', 'e', 'f'];
const VIEWPORT = { width: 1280, height: 670 };

const PILLAR_CONFIG = {
  guide_business: {
    label: 'GUIDE BUSINESS',
    accentColor: '#f5a623',
    accentColorLight: '#fde68a',
  },
  guide_ai: {
    label: 'AI × GUIDE',
    accentColor: '#64c8ff',
    accentColorLight: '#a5d8ff',
  },
  culture_branding: {
    label: '日本文化 × 外国人目線',
    accentColor: '#ff6b35',
    accentColorLight: '#ffcba4',
  },
};

let browser = null;

async function getBrowser() {
  if (!browser) {
    browser = await deps.launchBrowser();
  }
  return browser;
}

function formatTitle(title, maxCharsPerLine = 18) {
  if (!title) return '';
  const breakPoints = /([。！？：】])/g;
  let result = title.replace(breakPoints, '$1<br>');
  return result.split('<br>').map(line => {
    if (line.length <= maxCharsPerLine) return line;
    const chunks = [];
    for (let i = 0; i < line.length; i += maxCharsPerLine) {
      chunks.push(line.slice(i, i + maxCharsPerLine));
    }
    return chunks.join('<br>');
  }).join('<br>');
}

function getTitleFontSize(title) {
  const len = (title || '').length;
  if (len <= 20) return 60;
  if (len <= 30) return 52;
  if (len <= 45) return 44;
  return 38;
}

/**
 * 記事JSONを元に6パターンのサムネイルを生成
 * @param {string} accountId
 * @param {object} article - 記事JSONオブジェクト
 * @returns {Promise<{pattern: string, path: string}[]>} 生成された画像パスの配列
 */
async function generateAll(accountId, article) {
  const { title, pillar, id: articleId } = article;
  const account = await deps.config.getAccount(accountId);
  const authorName = account?.display_name || 'とっけん';
  const pillarConfig = PILLAR_CONFIG[pillar] || PILLAR_CONFIG.guide_business;

  const outputDir = path.join(
    __dirname, '../../data/accounts', accountId, 'thumbnails', String(articleId)
  );
  deps.fs.mkdirSync(outputDir, { recursive: true });

  const formattedTitle = formatTitle(title);
  const titleFontSize = getTitleFontSize(title);

  const b = await getBrowser();
  const results = [];

  for (const pattern of PATTERNS) {
    const templatePath = path.join(TEMPLATES_DIR, `pattern-${pattern}.html`);
    let html = deps.fs.readFileSync(templatePath, 'utf-8');

    // プレースホルダーを置換
    html = html
      .replace(/\{\{TITLE\}\}/g, formattedTitle)
      .replace(/\{\{TITLE_FONT_SIZE\}\}/g, String(titleFontSize))
      .replace(/\{\{PILLAR_LABEL\}\}/g, pillarConfig.label)
      .replace(/\{\{AUTHOR_NAME\}\}/g, authorName)
      .replace(/\{\{ACCENT_COLOR\}\}/g, pillarConfig.accentColor)
      .replace(/\{\{ACCENT_COLOR_LIGHT\}\}/g, pillarConfig.accentColorLight);

    const page = await b.newPage();
    await page.setViewportSize(VIEWPORT);
    await page.setContent(html, { waitUntil: 'networkidle' });

    // Google Fonts の読み込みを待つ
    await page.waitForTimeout(1000);

    const outputPath = path.join(outputDir, `pattern-${pattern}.png`);
    await page.screenshot({ path: outputPath, type: 'png' });
    await page.close();

    results.push({ pattern, path: outputPath });
    deps.logger.info('thumbnail', `Generated pattern-${pattern} for article ${articleId}`);
  }

  return results;
}

/**
 * 選択されたパターンをselected.pngとしてコピーし、パスを返す
 */
function selectThumbnail(accountId, articleId, pattern) {
  const dir = path.join(
    __dirname, '../../data/accounts', accountId, 'thumbnails', String(articleId)
  );
  const src = path.join(dir, `pattern-${pattern}.png`);
  const dest = path.join(dir, 'selected.png');

  if (!deps.fs.existsSync(src)) {
    throw new Error(`Thumbnail not found: pattern-${pattern} for article ${articleId}`);
  }

  deps.fs.copyFileSync(src, dest);
  deps.logger.info('thumbnail', `Selected pattern-${pattern} for article ${articleId}`);

  return dest;
}

/**
 * 生成済みサムネイル一覧を返す
 */
function listThumbnails(accountId, articleId) {
  const dir = path.join(
    __dirname, '../../data/accounts', accountId, 'thumbnails', String(articleId)
  );
  if (!deps.fs.existsSync(dir)) return [];

  return PATTERNS
    .map(p => ({
      pattern: p,
      path: path.join(dir, `pattern-${p}.png`),
      exists: deps.fs.existsSync(path.join(dir, `pattern-${p}.png`)),
    }))
    .filter(t => t.exists);
}

/**
 * ブラウザを閉じる（アプリ終了時に呼ぶ）
 */
async function cleanup() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

module.exports = {
  generateAll,
  selectThumbnail,
  listThumbnails,
  cleanup,
  // テスト用
  _internal: { formatTitle, getTitleFontSize, PILLAR_CONFIG },
  _setDepsForTesting: (overrides) => {
    deps = { ...deps, ...overrides };
    browser = null;
  },
};
