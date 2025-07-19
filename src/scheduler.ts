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
import { CacheManager } from './utils/cache';

function formatResult(taskName: string, message: string, isError: boolean = false): string {
  return isError ? `Task "${taskName}" error: ${message}` : `Task "${taskName}" result:\n${message}`;
}

async function executeTask(task: TaskDTO, bot: Telegraf<BotContext>, db: Database, isManual: boolean = false): Promise<string> {
  const context = { module: 'Scheduler', taskId: task.id, chatId: task.chatId, url: task.url };
  try {
    const cachedResponse = CacheManager.getCachedResponse(task.chatId, task.id.toString());
    if (cachedResponse) {
      if (!isManual && task.alert_if_true === 'yes') {
        try {
          const parsedResult = JSON.parse(cachedResponse);
          if (parsedResult.is_show !== true) return '';
        } catch {
          Logger.warn(context, `Failed to parse cached response`);
        }
      }
      return cachedResponse;
    }

    if (!CacheManager.canRunTask()) {
      return CacheManager.addToQueue(task.chatId, task.id.toString(), bot, db, isManual);
    }

    try {
      if (!task.url || !task.tags) {
        const result = formatResult(task.name, `Notification: ${task.prompt}\nWarning: Standard notification mode active (no website or tags specified).`);
        CacheManager.cacheResponse(task.chatId, task.id.toString(), result);
        return result;
      }

      const tags = task.tags.split(',').map(tag => tag.trim());
      const content = await parseSite(task.url, tags, 2, 2000, task.chatId, task.id);
      if (content.startsWith('Error')) {
        const result = formatResult(task.name, content, true);
        CacheManager.cacheResponse(task.chatId, task.id.toString(), result);
        return result;
      }
      const result = await processWithOllama(task.prompt, content, task.alert_if_true || 'no', task.chatId);
      if (result.startsWith('Error')) {
        const errorResult = formatResult(task.name, result, true);
        CacheManager.cacheResponse(task.chatId, task.id.toString(), errorResult);
        return errorResult;
      }

      if (task.alert_if_true === 'yes' && !isManual) {
        const parsedResult = JSON.parse(result);
        if (parsedResult.is_show !== true) return '';
        const finalResult = formatResult(task.name, parsedResult.details);
        CacheManager.cacheResponse(task.chatId, task.id.toString(), finalResult);
        return finalResult;
      }

      const finalResult = formatResult(task.name, result);
      CacheManager.cacheResponse(task.chatId, task.id.toString(), finalResult);
      return finalResult;
    } finally {
      CacheManager.endTask();
    }
  } catch (err) {
    Logger.error(context, `Task "${task.name}" error: ${(err as Error).message}`, err);
    const errorResult = formatResult(task.name, (err as Error).message, true);
    CacheManager.cacheResponse(task.chatId, task.id.toString(), errorResult);
    CacheManager.endTask();
    return errorResult;
  }
}

const scheduledTasks: Map<number, ScheduledTask> = new Map();

export async function scheduleTasks(bot: Telegraf<BotContext>, db: Database) {
  const context = { module: 'Scheduler' };
  try {
    scheduledTasks.forEach((task, id) => {
      task.stop();
      scheduledTasks.delete(id);
    });

    const tasks = await getTasks(db);
    const taskGroups: { [key: string]: TaskDTO[] } = {};

    for (const task of tasks) {
      if (task.schedule && cron.validate(task.schedule) && task.id !== undefined) {
        if (!taskGroups[task.schedule]) taskGroups[task.schedule] = [];
        taskGroups[task.schedule].push(task);
      } else {
        Logger.info(
          { module: 'Scheduler', taskId: task.id, chatId: task.chatId },
          `Task "${task.name || 'unknown'}" not scheduled: No valid cron expression or intended for manual execution`
        );
      }
    }

    for (const [schedule, taskGroup] of Object.entries(taskGroups)) {
      taskGroup.forEach((task, index) => {
        const delay = index * 5 * 60 * 1000;
        const scheduledTask = cron.schedule(schedule, async () => {
          try {
            setTimeout(async () => {
              const result = await executeTask(task, bot, db, false);
              if (result) await bot.telegram.sendMessage(task.chatId, result);
            }, delay);
          } catch (err) {
            Logger.error(
              { module: 'Scheduler', taskId: task.id, chatId: task.chatId },
              `Scheduled task "${task.name}" execution failed: ${(err as Error).message}`,
              err
            );
          }
        });
        scheduledTasks.set(task.id, scheduledTask);
      });
    }
  } catch (err) {
    Logger.error(context, 'Error scheduling tasks', err);
  }
}

export { executeTask };