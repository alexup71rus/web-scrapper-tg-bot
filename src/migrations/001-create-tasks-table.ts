import { Database } from 'sql.js';

export async function up(db: Database): Promise<void> {
  db.run(`
    CREATE TABLE IF NOT EXISTS migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const migrationCheck = db.exec("SELECT name FROM migrations WHERE name = '001-create-tasks-table'");
  if (migrationCheck[0]?.values.length) {
    console.log('Migration 001-create-tasks-table already applied, skipping');
    return;
  }

  const existingData = [];
  const tableExists = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'");
  if (tableExists[0]?.values.length) {
    const stmt = db.prepare('SELECT * FROM tasks');
    while (stmt.step()) {
      existingData.push(stmt.getAsObject());
    }
    stmt.free();
  }

  if (!tableExists[0]?.values.length) {
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
  } else {
    const columns = db.exec("PRAGMA table_info(tasks)");
    const hasChatId = columns[0]?.values.some((col: any) => col[1] === 'chatId');
    if (!hasChatId) {
      db.run('ALTER TABLE tasks ADD COLUMN chatId INTEGER');
    }
  }

  if (existingData.length > 0 && !tableExists[0]?.values.length) {
    const stmt = db.prepare(
      'INSERT INTO tasks (id, name, ollama_host, model, prompt, duration, tags, url, chatId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    for (const row of existingData) {
      stmt.run([
        row.id,
        row.name,
        row.ollama_host,
        row.model,
        row.prompt,
        row.duration,
        row.tags,
        row.url,
        row.chatId
      ]);
    }
    stmt.free();
  }

  db.run("INSERT INTO migrations (name) VALUES ('001-create-tasks-table')");

  const postMigrationCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'");
  if (!postMigrationCheck[0]?.values.length) {
    throw new Error('Failed to create or verify tasks table');
  }
}