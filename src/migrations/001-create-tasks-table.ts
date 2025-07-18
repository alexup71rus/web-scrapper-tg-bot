import { Database } from 'sql.js';
import { Logger } from '../utils/logger';

export async function up(db: Database): Promise<void> {
  const context = { module: 'Migration' };
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const migrationCheck = db.exec("SELECT name FROM migrations WHERE name = '001-create-tasks-table'");
    if (migrationCheck[0]?.values.length) {
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
      db.run('DROP TABLE tasks');
    }

    db.run(`
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        tags TEXT DEFAULT 'body',
        schedule TEXT NOT NULL,
        raw_schedule TEXT,
        alert_if_true TEXT DEFAULT 'no',
        prompt TEXT NOT NULL,
        chatId TEXT NOT NULL
      )
    `);

    if (existingData.length > 0) {
      const stmt = db.prepare(
        'INSERT INTO tasks (id, name, url, tags, schedule, raw_schedule, alert_if_true, prompt, chatId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const row of existingData) {
        const name = row.name || `Task_${row.id || 'Unknown'}`;
        const schedule = row.schedule || '* * * * *';
        const raw_schedule = row.raw_schedule || null;
        const tags = row.tags || 'body';
        const prompt = row.prompt || 'Summarize this content: {content}';
        const chatId = row.chatId ? String(row.chatId) : null;
        if (chatId && row.url && row.id) {
          stmt.run([
            Number(row.id),
            name,
            row.url,
            tags,
            schedule,
            raw_schedule,
            row.alert_if_true || 'no',
            prompt,
            chatId,
          ]);
        }
      }
      stmt.free();
    }

    db.run("INSERT INTO migrations (name) VALUES ('001-create-tasks-table')");

    const postMigrationCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'");
    if (!postMigrationCheck[0]?.values.length) {
      throw new Error('Failed to create or verify tasks table');
    }
  } catch (err) {
    Logger.error(context, 'Error applying migration 001-create-tasks-table', err);
    throw new Error(`Migration failed: ${(err as Error).message}`);
  }
}