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
        url TEXT,
        tags TEXT,
        schedule TEXT,
        raw_schedule TEXT,
        alert_if_true TEXT,
        prompt TEXT NOT NULL,
        chatId TEXT NOT NULL
      )
    `);

    if (existingData.length > 0) {
      const stmt = db.prepare(
        'INSERT INTO tasks (id, name, url, tags, schedule, raw_schedule, alert_if_true, prompt, chatId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const row of existingData) {
        const name = row.name ? String(row.name) : `Task_${row.id || 'Unknown'}`;
        const prompt = row.prompt ? String(row.prompt) : 'Default notification';
        const chatId = row.chatId ? String(row.chatId) : null;
        if (chatId && row.id) {
          stmt.run([
            Number(row.id),
            name,
            row.url !== undefined && row.url !== null ? String(row.url) : null,
            row.tags !== undefined && row.tags !== null ? String(row.tags) : null,
            row.schedule !== undefined && row.schedule !== null ? String(row.schedule) : null,
            row.raw_schedule !== undefined && row.raw_schedule !== null ? String(row.raw_schedule) : null,
            row.alert_if_true !== undefined && row.alert_if_true !== null ? String(row.alert_if_true) : null,
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