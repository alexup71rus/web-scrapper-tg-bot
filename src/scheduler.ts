import { Database } from 'sql.js';
import { TaskConfig } from './types';
import { getTasks } from './services/database';
import * as cron from 'node-cron';
import { ScheduledTask } from 'node-cron';
import { parseSite } from './parser';
import { processWithOllama } from './ollama';
import { Telegraf } from 'telegraf';
import { BotContext } from './types';

async function executeTask(task: TaskConfig, bot: Telegraf<BotContext>, isManual: boolean = false): Promise<string> {
  try {
    const tags = task.tags ? task.tags.split(',').map(tag => tag.trim()) : ['body'];
    const content = await parseSite(task.url, tags);
    if (content.startsWith('Error')) {
      console.log(`Task ${task.name} failed: ${content}`);
      return `Task "${task.name}" failed: ${content}`;
    }
    const result = await processWithOllama(task.prompt, content, task.alert_if_true || 'no');
    if (result.startsWith('Error')) {
      console.log(`Task ${task.name} failed in Ollama: ${result}`);
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
    console.log(`Task ${task.name} error: ${(err as Error).message}`);
    return `Task "${task.name}" error: ${(err as Error).message}`;
  }
}

const scheduledTasks: Map<number, ScheduledTask> = new Map();

export async function scheduleTasks(bot: Telegraf<BotContext>, db: Database) {
  scheduledTasks.forEach((task, id) => {
    task.stop();
    scheduledTasks.delete(id);
  });

  const tasks = await getTasks(db);
  for (const task of tasks) {
    if (task.schedule && cron.validate(task.schedule) && task.id !== undefined) {
      const scheduledTask = cron.schedule(task.schedule, async () => {
        const result = await executeTask(task, bot, false); // Automatic execution
        if (result) {
          await bot.telegram.sendMessage(task.chatId, result);
        }
      });
      scheduledTasks.set(task.id, scheduledTask);
    } else {
      console.error(`Failed to schedule task ${task.name || 'unknown'}: Invalid cron or task ID`);
    }
  }
}

export { executeTask };