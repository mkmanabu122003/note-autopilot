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
};
