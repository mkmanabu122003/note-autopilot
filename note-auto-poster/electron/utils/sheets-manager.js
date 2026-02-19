const { google } = require('googleapis');

const COLUMN = { TOPIC: 0, STATUS: 1, ARTICLE_PATH: 2 };
const STATUS = { PENDING: 'pending', GENERATING: 'generating', GENERATED: 'generated', ERROR: 'error' };
const HEADER_ROW = ['topic', 'status', 'article_path'];

async function authenticate(credentialsPath) {
  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth;
}

function getSheetsClient(auth) {
  return google.sheets({ version: 'v4', auth });
}

async function getTopics(sheets, spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:C`,
  });

  const rows = res.data.values || [];
  if (rows.length <= 1) return [];

  return rows.slice(1).map((row, index) => ({
    rowIndex: index + 2, // 1-based, skip header
    topic: row[COLUMN.TOPIC] || '',
    status: row[COLUMN.STATUS] || '',
    articlePath: row[COLUMN.ARTICLE_PATH] || '',
  }));
}

async function getPendingTopics(sheets, spreadsheetId, sheetName) {
  const topics = await getTopics(sheets, spreadsheetId, sheetName);
  return topics.filter((t) => t.status === STATUS.PENDING);
}

async function updateTopicStatus(sheets, spreadsheetId, sheetName, rowIndex, status, articlePath) {
  const values = articlePath ? [[status, articlePath]] : [[status]];
  const range = articlePath
    ? `${sheetName}!B${rowIndex}:C${rowIndex}`
    : `${sheetName}!B${rowIndex}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}

module.exports = {
  COLUMN,
  STATUS,
  HEADER_ROW,
  authenticate,
  getSheetsClient,
  getTopics,
  getPendingTopics,
  updateTopicStatus,
};
