const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'news.db');
const db = new Database(dbPath);

const rows = db.prepare("SELECT rowid, title, tags FROM articles ORDER BY date DESC LIMIT 5").all();
console.log('Current tags:', JSON.stringify(rows, null, 2));

// Force update one article if tags are empty
if (rows.length > 0 && (!rows[0].tags || rows[0].tags === '[]')) {
  console.log('Updating tags for first article...');
  db.prepare("UPDATE articles SET tags = ? WHERE rowid = ?").run(JSON.stringify(['AI', 'LLM', 'Research']), rows[0].rowid);
  console.log('Updated.');
}
