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

  // Drop the existing tasks table if it exists to avoid column conflicts
  if (tableExists[0]?.values.length) {
    db.run('DROP TABLE tasks');
  }

  // Create the new tasks table with updated schema
  db.run(`
    CREATE TABLE tasks (
      id INTEGER UNIQUE,
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

  // Migrate existing data to the new schema (only compatible fields)
  if (existingData.length > 0) {
    const stmt = db.prepare(
      'INSERT INTO tasks (id, name, url, tags, schedule, raw_schedule, alert_if_true, prompt, chatId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    for (const row of existingData) {
      // Map old fields to new schema, skip incompatible fields
      const name = row.name || `Task_${row.id || 'Unknown'}`; // Fallback for name
      const schedule = row.duration || row.schedule || '* * * * *'; // Fallback if duration or schedule is missing
      const raw_schedule = row.duration || null; // Use duration as raw_schedule if available
      const tags = row.tags || 'body'; // Fallback to default
      const prompt = row.prompt || 'Summarize this content: {content}'; // Fallback if prompt is missing
      const chatId = row.chatId ? String(row.chatId) : null; // Convert to string, handle null
      if (chatId && row.url && row.id) {
        stmt.run([
          row.id,
          name,
          row.url,
          tags,
          schedule,
          raw_schedule,
          'no', // Default for alert_if_true
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
}