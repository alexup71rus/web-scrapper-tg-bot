import { Database } from 'sql.js';
import * as fs from 'fs/promises';
import { TaskDTO } from '../types';
import { TaskValidator } from '../utils/taskValidator';
import { Logger } from '../utils/logger';

export async function saveDb(db: Database): Promise<void> {
  const context = { module: 'Database' };
  try {
    const tableCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'");
    if (!tableCheck[0]?.values.length) {
      Logger.error(context, 'No tasks table found, skipping database save');
      return;
    }
    const data = db.export();
    await fs.writeFile('./data.db', Buffer.from(data));
  } catch (err) {
    Logger.error(context, 'Error saving database', err);
    throw err;
  }
}

export async function getTasks(db: Database): Promise<TaskDTO[]> {
  const context = { module: 'Database' };
  try {
    const stmt = db.prepare('SELECT id, name, url, tags, schedule, raw_schedule, alert_if_true, prompt, chatId FROM tasks');
    const tasks: TaskDTO[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      const task: TaskDTO = {
        id: Number(row.id),
        name: String(row.name),
        url: String(row.url),
        tags: row.tags !== undefined && row.tags !== null ? String(row.tags) : undefined,
        schedule: String(row.schedule),
        raw_schedule: row.raw_schedule !== undefined && row.raw_schedule !== null ? String(row.raw_schedule) : undefined,
        alert_if_true: row.alert_if_true !== undefined && row.alert_if_true !== null ? String(row.alert_if_true) as 'yes' | 'no' : undefined,
        prompt: String(row.prompt),
        chatId: String(row.chatId),
      };
      if (TaskValidator.isValidTaskConfig(task)) {
        tasks.push(task);
      } else {
        Logger.error({ ...context, chatId: task.chatId }, `Invalid task data: ${JSON.stringify(task)}`);
      }
    }
    stmt.free();
    return tasks;
  } catch (err) {
    Logger.error(context, 'Error retrieving tasks from database', err);
    return [];
  }
}

export async function getTaskById(db: Database, id: number): Promise<TaskDTO | null> {
  const context = { module: 'Database', taskId: id };
  try {
    const stmt = db.prepare('SELECT id, name, url, tags, schedule, raw_schedule, alert_if_true, prompt, chatId FROM tasks WHERE id = ?');
    stmt.bind([id]);
    const row = stmt.step() ? stmt.getAsObject() as Record<string, unknown> : null;
    stmt.free();
    if (row) {
      const task: TaskDTO = {
        id: Number(row.id),
        name: String(row.name),
        url: String(row.url),
        tags: row.tags !== undefined && row.tags !== null ? String(row.tags) : undefined,
        schedule: String(row.schedule),
        raw_schedule: row.raw_schedule !== undefined && row.raw_schedule !== null ? String(row.raw_schedule) : undefined,
        alert_if_true: row.alert_if_true !== undefined && row.alert_if_true !== null ? String(row.alert_if_true) as 'yes' | 'no' : undefined,
        prompt: String(row.prompt),
        chatId: String(row.chatId),
      };
      if (TaskValidator.isValidTaskConfig(task)) {
        return task;
      } else {
        Logger.error({ ...context, chatId: task.chatId }, `Task with ID ${id} invalid: ${JSON.stringify(task)}`);
        return null;
      }
    }
    Logger.error(context, `Task with ID ${id} not found`);
    return null;
  } catch (err) {
    Logger.error(context, `Error retrieving task with ID ${id}`, err);
    return null;
  }
}