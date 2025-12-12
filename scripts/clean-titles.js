const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/news.db');
const db = new Database(dbPath);

const categories = [
  'Policy', 'Interpretability', 'Alignment', 'Societal Impacts', 
  'Economic Research', 'Product', 'Announcements', 'Engineering'
];

const articles = db.prepare("SELECT link, title FROM articles WHERE source = 'Anthropic'").all();

const updateStmt = db.prepare('UPDATE articles SET title = ? WHERE link = ?');

let count = 0;
for (const article of articles) {
  let title = article.title;
  let original = title;
  
  for (const cat of categories) {
    if (title.startsWith(cat) && !title.startsWith(cat + ' ')) {
      // Check if the next character is uppercase (likely start of real title)
      const nextChar = title.charAt(cat.length);
      if (nextChar === nextChar.toUpperCase() && nextChar !== ' ') {
         title = title.substring(cat.length);
         break; 
      }
    }
  }
  
  // Clean up snippet-like suffixes (heuristic: very long titles)
  if (title.length > 150) {
      // Try to find the first sentence or split by newline if present
      // But here it's likely merged text.
      // We'll just truncate if it's absurdly long, or leave it.
      // "Circuit tracing lets us watch..." seems like a description.
      // We can try to split by "  " (double space) if it exists, or just leave it.
  }

  if (title !== original) {
    console.log(`Fixing: "${original}" -> "${title}"`);
    updateStmt.run(title, article.link);
    count++;
  }
}

console.log(`Cleaned ${count} titles.`);
