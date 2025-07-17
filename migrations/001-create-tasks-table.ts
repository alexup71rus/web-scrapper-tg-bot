import { Database } from 'sql.js';

export async function up(db: Database): Promise<void> {
  // Check if table exists
  const tableExists = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'");
  if (!tableExists[0]?.values.length) {
    // Create tasks table with chatId
    db.run(`
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        ollama_host TEXT,
        model TEXT,
        prompt TEXT,
        duration TEXT,
        tags TEXT,
        url TEXT,
        chatId INTEGER
      )
    `);
    console.log('Table "tasks" created successfully with chatId');
  } else {
    // Check if chatId column exists
    const columns = db.exec("PRAGMA table_info(tasks)");
    const hasChatId = columns[0]?.values.some((col: any) => col[1] === 'chatId');
    if (!hasChatId) {
      db.run('ALTER TABLE tasks ADD COLUMN chatId INTEGER');
      console.log('Added chatId column to existing tasks table');
    } else {
      console.log('Table "tasks" already exists with chatId, skipping');
    }
  }

  // Verify table structure
  const postMigrationCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'");
  if (!postMigrationCheck[0]?.values.length) {
    throw new Error('Failed to create or verify tasks table');
  }
}