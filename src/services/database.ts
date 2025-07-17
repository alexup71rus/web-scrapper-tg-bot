import { Database } from 'sql.js';
import * as fs from 'fs/promises';
import { TaskConfig } from '../types';
import { isValidTaskConfig } from '../utils/validation';

export async function saveDb(db: Database) {
  try {
    const tableCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'");
    if (!tableCheck[0]?.values.length) {
      console.error('❌ No tasks table found, skipping save');
      return;
    }
    const data = db.export();
    await fs.writeFile('./tasks.db', Buffer.from(data));
    console.log('Database saved successfully');
  } catch (err) {
    console.error('❌ Error saving database:', err);
  }
}

export async function getTasks(db: Database): Promise<TaskConfig[]> {
  const stmt = db.prepare('SELECT * FROM tasks');
  const tasks: TaskConfig[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as unknown;
    if (isValidTaskConfig(row)) {
      tasks.push(row as TaskConfig);
    } else {
      console.error('❌ Invalid task data:', row);
    }
  }
  stmt.free();
  return tasks;
}

export async function getTaskById(db: Database, id: number): Promise<TaskConfig | null> {
  const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
  stmt.bind([id]);
  const task = stmt.step() ? stmt.getAsObject() as unknown : null;
  stmt.free();
  return task && isValidTaskConfig(task) ? (task as TaskConfig) : null;
}