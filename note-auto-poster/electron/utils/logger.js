const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../../data/logs');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function formatMessage(level, module, message, meta) {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}${metaStr}`;
}

function writeLog(formatted) {
  try {
    ensureLogDir();
    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(LOG_DIR, `${date}.log`);
    fs.appendFileSync(logFile, formatted + '\n');
  } catch {
    // ログ書き込み失敗は無視
  }
}

function parseLine(line) {
  const match = line.match(
    /^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\]\s+\[(\w+)\]\s+\[([^\]]+)\]\s+(.+)$/
  );
  if (!match) return null;
  return { timestamp: match[1], level: match[2].toLowerCase(), module: match[3], message: match[4] };
}

module.exports = {
  info(module, message, meta) {
    const formatted = formatMessage('info', module, message, meta);
    console.log(formatted);
    writeLog(formatted);
  },

  warn(module, message, meta) {
    const formatted = formatMessage('warn', module, message, meta);
    console.warn(formatted);
    writeLog(formatted);
  },

  error(module, message, meta) {
    const formatted = formatMessage('error', module, message, meta);
    console.error(formatted);
    writeLog(formatted);
  },

  /**
   * Get log entries with filtering and pagination.
   * @param {Object} opts
   * @param {number} opts.days - How many days back to read (default 7)
   * @param {string} opts.level - Filter by level ('all','error','warn','info')
   * @param {number} opts.page - 1-based page number
   * @param {number} opts.pageSize - Entries per page (default 50)
   * @returns {{ entries: Array, total: number, page: number, totalPages: number, availableDates: string[] }}
   */
  getLogs({ days = 7, level = 'all', page = 1, pageSize = 50 } = {}) {
    ensureLogDir();

    // List available log files
    const files = fs.readdirSync(LOG_DIR)
      .filter(f => f.endsWith('.log'))
      .sort()
      .reverse();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const filteredFiles = files.filter(f => f.replace('.log', '') >= cutoffStr);
    const availableDates = files.map(f => f.replace('.log', ''));

    // Read and parse all matching entries
    let entries = [];
    for (const file of filteredFiles) {
      try {
        const content = fs.readFileSync(path.join(LOG_DIR, file), 'utf-8');
        const lines = content.split('\n').filter(Boolean);
        for (const line of lines) {
          const parsed = parseLine(line);
          if (parsed) entries.push(parsed);
        }
      } catch {
        // skip unreadable files
      }
    }

    // Sort newest first
    entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    // Filter by level
    if (level !== 'all') {
      entries = entries.filter(e => e.level === level);
    }

    const total = entries.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.max(1, Math.min(page, totalPages));
    const start = (safePage - 1) * pageSize;
    const paged = entries.slice(start, start + pageSize);

    return { entries: paged, total, page: safePage, totalPages, availableDates };
  },

  /**
   * Delete log files older than the given number of days.
   */
  cleanup(days = 30) {
    ensureLogDir();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.log'));
    let deleted = 0;
    for (const file of files) {
      if (file.replace('.log', '') < cutoffStr) {
        try {
          fs.unlinkSync(path.join(LOG_DIR, file));
          deleted++;
        } catch { /* ignore */ }
      }
    }
    return deleted;
  },
};
