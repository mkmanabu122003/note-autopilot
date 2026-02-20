/**
 * Frontmatter utility for articles.
 * Handles reading/writing YAML frontmatter in markdown files.
 * Backward-compatible: articles without frontmatter are handled gracefully.
 */

const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n/;

/**
 * Parse YAML frontmatter from markdown content.
 * Returns { metadata: {}, body: string }
 */
function parse(content) {
  if (!content) return { metadata: {}, body: '' };

  const match = content.match(FRONTMATTER_REGEX);
  if (!match) {
    return { metadata: {}, body: content };
  }

  const yamlStr = match[1];
  const body = content.slice(match[0].length);
  const metadata = {};

  for (const line of yamlStr.split('\n')) {
    // Handle array items (tags)
    if (line.match(/^\s+-\s+/)) {
      // This is an array item for the last key
      const value = line.replace(/^\s+-\s+/, '').trim();
      const lastKey = Object.keys(metadata).pop();
      if (lastKey && Array.isArray(metadata[lastKey])) {
        metadata[lastKey].push(value);
      }
      continue;
    }

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    if (!key) continue;

    // Type coercion
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (value !== '' && !isNaN(Number(value))) value = Number(value);
    else if (value === '') {
      // Could be start of array or multiline - check next lines
      // For now, initialize as empty array (tags pattern)
      value = [];
    }

    metadata[key] = value;
  }

  return { metadata, body };
}

/**
 * Serialize metadata and body into markdown with frontmatter.
 */
function stringify(metadata, body) {
  if (!metadata || Object.keys(metadata).length === 0) {
    return body || '';
  }

  const lines = ['---'];
  for (const [key, value] of Object.entries(metadata)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${item}`);
      }
    } else if (value === undefined || value === null) {
      continue;
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push('---');
  lines.push('');

  return lines.join('\n') + (body || '');
}

/**
 * Extract title from article body (first line, strip # prefix).
 */
function extractTitle(body) {
  if (!body) return '';
  const firstLine = body.split('\n')[0] || '';
  return firstLine.replace(/^#+\s*/, '').trim();
}

module.exports = { parse, stringify, extractTitle };
