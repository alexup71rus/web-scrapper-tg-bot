import { Database } from 'sql.js';
import { TaskDTO } from './types';
import { getTasks } from './services/database';
import * as cron from 'node-cron';
import { ScheduledTask } from 'node-cron';
import { parseSite } from './parser';
import { processWithOllama } from './ollama';
import { Telegraf } from 'telegraf';
import { BotContext } from './types';
import { Logger } from './utils/logger';

// Executes a task by parsing site content or returning prompt for manual notifications
async function executeTask(task: TaskDTO, bot: Telegraf<BotContext>, isManual: boolean = false): Promise<string> {
  const context = { module: 'Scheduler', taskId: task.id, chatId: task.chatId, url: task.url };
  try {
    if (!task.url || !task.tags) {
      return `Notification: ${task.prompt}\nWarning: Standard notification mode active (no website or tags specified).`;
    }

    const tags = task.tags.split(',').map(tag => tag.trim());
    const content = await parseSite(task.url, tags, 2, 2000, task.chatId, task.id);
    if (content.startsWith('Error')) {
      return `Task "${task.name}" failed: ${content}`;
    }
    const result = await processWithOllama(task.prompt, content, task.alert_if_true || 'no', task.chatId);
    if (result.startsWith('Error')) {
      return `Task "${task.name}" failed in Ollama: ${result}`;
    }

    if (task.alert_if_true === 'yes' && !isManual) {
      const parsedResult = JSON.parse(result);
      if (parsedResult.is_show !== true) {
        return ''; // Suppress message for automatic execution if is_show is not true
      }
      return `Task "${task.name}" result:\n${parsedResult.details}`;
    }

    return `Task "${task.name}" result:\n${result}`;
  } catch (err) {
    Logger.error(context, `Task "${task.name}" error: ${(err as Error).message}`, err);
    return `Task "${task.name}" error: ${(err as Error).message}`;
  }
}

const scheduledTasks: Map<number, ScheduledTask> = new Map();

// Schedules tasks from the database using cron expressions
export async function scheduleTasks(bot: Telegraf<BotContext>, db: Database) {
  const context = { module: 'Scheduler' };
  try {
    scheduledTasks.forEach((task, id) => {
      task.stop();
      scheduledTasks.delete(id);
    });

    const tasks = await getTasks(db);
    for (const task of tasks) {
      if (task.schedule && cron.validate(task.schedule) && task.id !== undefined) {
        const scheduledTask = cron.schedule(task.schedule, async () => {
          try {
            const result = await executeTask(task, bot, false);
            if (result) {
              await bot.telegram.sendMessage(task.chatId, result);
            }
          } catch (err) {
            Logger.error(
              { module: 'Scheduler', taskId: task.id, chatId: task.chatId },
              `Scheduled task "${task.name}" execution failed: ${(err as Error).message}`,
              err
            );
          }
        });
        scheduledTasks.set(task.id, scheduledTask);
      } else {
        Logger.info(
          { module: 'Scheduler', taskId: task.id, chatId: task.chatId },
          `Task "${task.name || 'unknown'}" not scheduled: No valid cron expression or intended for manual execution`
        );
      }
    }
  } catch (err) {
    Logger.error(context, 'Error scheduling tasks', err);
  }
}

export { executeTask };