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
    const schemaCheck = db.exec(`PRAGMA table_info(tasks)`);
    const columns = schemaCheck[0]?.values.map(row => ({
      name: row[1] as string,
      type: row[2] as string,
      notNull: row[3] === 1,
      defaultValue: row[4],
    })) || [];

    const expectedColumns = [
      { name: 'id', type: 'INTEGER', notNull: true, defaultValue: null },
      { name: 'name', type: 'TEXT', notNull: true, defaultValue: null },
      { name: 'url', type: 'TEXT', notNull: false, defaultValue: null },
      { name: 'tags', type: 'TEXT', notNull: false, defaultValue: null },
      { name: 'schedule', type: 'TEXT', notNull: false, defaultValue: null },
      { name: 'raw_schedule', type: 'TEXT', notNull: false, defaultValue: null },
      { name: 'alert_if_true', type: 'TEXT', notNull: false, defaultValue: null },
      { name: 'prompt', type: 'TEXT', notNull: true, defaultValue: null },
      { name: 'chatId', type: 'TEXT', notNull: true, defaultValue: null },
    ];

    const schemaMatches = columns.length === expectedColumns.length &&
      columns.every((col, i) => {
        const expected = expectedColumns[i];
        return col.name === expected.name &&
               col.type === expected.type &&
               col.notNull === expected.notNull &&
               col.defaultValue === expected.defaultValue;
      });

    if (migrationCheck[0]?.values.length && schemaMatches) {
      Logger.info(context, 'Tasks table schema is up-to-date and migration already applied, skipping');
      return;
    }

    if (!migrationCheck[0]?.values.length && !columns.length) {
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
      db.run("INSERT INTO migrations (name) VALUES ('001-create-tasks-table')");
    } else if (!schemaMatches) {
      db.run(`
        CREATE TABLE temp_tasks (
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
      db.run(`
        INSERT INTO temp_tasks (id, name, url, tags, schedule, raw_schedule, alert_if_true, prompt, chatId)
        SELECT id, name, url, tags, schedule, raw_schedule, alert_if_true, prompt, chatId
        FROM tasks
      `);
      db.run('DROP TABLE tasks');
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
      db.run(`
        INSERT INTO tasks (id, name, url, tags, schedule, raw_schedule, alert_if_true, prompt, chatId)
        SELECT id, name, url, tags, schedule, raw_schedule, alert_if_true, prompt, chatId
        FROM temp_tasks
      `);
      db.run('DROP TABLE temp_tasks');
      if (!migrationCheck[0]?.values.length) {
        db.run("INSERT INTO migrations (name) VALUES ('001-create-tasks-table')");
      }
    }

    const postMigrationCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'");
    if (!postMigrationCheck[0]?.values.length) {
      throw new Error('Failed to create or verify tasks table');
    }
  } catch (err) {
    Logger.error(context, 'Error applying migration 001-create-tasks-table', err);
    throw new Error(`Migration failed: ${(err as Error).message}`);
  }
}