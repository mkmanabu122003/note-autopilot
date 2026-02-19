const path = require('path');

const DEFAULT_SHEET_NAME = 'topics';
const DEFAULT_DATA_DIR = path.join(__dirname, '..', '..', 'data');

function loadConfig() {
  return {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    sheets: {
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || '',
      sheetName: process.env.GOOGLE_SHEET_NAME || DEFAULT_SHEET_NAME,
      credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH || '',
    },
    dataDir: process.env.DATA_DIR || DEFAULT_DATA_DIR,
  };
}

module.exports = { loadConfig };
