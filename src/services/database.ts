import { Database } from 'sql.js';
import * as fs from 'fs/promises';
import { TaskDTO } from '../types';
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

export async function getTasks(db: Database): Promise<TaskDTO[]> {
  const stmt = db.prepare('SELECT id, name, url, tags, schedule, raw_schedule, alert_if_true, prompt, chatId FROM tasks');
  const tasks: TaskDTO[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as unknown;
    if (isValidTaskConfig(row)) {
      tasks.push(row as TaskDTO);
    } else {
      console.error('❌ Invalid task data:', row);
    }
  }
  stmt.free();
  return tasks;
}

export async function getTaskById(db: Database, id: number): Promise<TaskDTO | null> {
  const stmt = db.prepare('SELECT id, name, url, tags, schedule, raw_schedule, alert_if_true, prompt, chatId FROM tasks WHERE id = ?');
  stmt.bind([id]);
  const task = stmt.step() ? stmt.getAsObject() as unknown : null;
  stmt.free();
  return task && isValidTaskConfig(task) ? (task as TaskDTO) : null;
}