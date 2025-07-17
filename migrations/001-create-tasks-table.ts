import { Database } from 'sql.js';

export async function up(db: Database): Promise<void> {
  // Check if table exists
  const tableExists = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'");
  if (tableExists[0]?.values.length) {
    console.log('Table "tasks" already exists, skipping creation');
    return;
  }

  // Create tasks table
  db.run(`
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      ollama_host TEXT,
      model TEXT,
      prompt TEXT,
      duration TEXT,
      tags TEXT,
      url TEXT
    )
  `);

  // Verify table creation
  const postMigrationCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'");
  if (!postMigrationCheck[0]?.values.length) {
    throw new Error('Failed to create tasks table');
  }
  console.log('Table "tasks" created successfully');
}