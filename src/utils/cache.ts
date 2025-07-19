import { Logger } from './logger';
import { Telegraf } from 'telegraf';
import { BotContext, CacheEntry, QueueEntry, TaskDTO } from '../types';
import { executeTask } from '../scheduler';
import { Database } from 'sql.js';
import { getTaskById } from '../services/database';

export class CacheManager {
  private static taskCache: Map<string, CacheEntry> = new Map();
  private static queue: QueueEntry[] = [];
  private static readonly CACHE_TTL = 10 * 1000;
  private static readonly MAX_CACHE_SIZE = 1000;
  private static readonly QUEUE_DELAY = 10 * 1000;
  private static readonly MAX_QUEUE_SIZE = 10;
  private static runningCount = 0;
  private static readonly MAX_RUNNING_TASKS = 3;

  static getCachedResponse(chatId: string, taskId: string): string | null {
    const key = `${chatId}:${taskId}`;
    const entry = this.taskCache.get(key);
    if (!entry) {
      Logger.info({ module: 'Cache', chatId, taskId }, `No cached response for task`);
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > this.CACHE_TTL) {
      this.taskCache.delete(key);
      Logger.info({ module: 'Cache', chatId, taskId }, `Cached response expired`);
      return null;
    }
    return entry.response;
  }

  static cacheResponse(chatId: string, taskId: string, response: string): void {
    if (response.startsWith('Error')) {
      Logger.info({ module: 'Cache', chatId, taskId }, 'Skipping cache for error response');
      return;
    }
    const key = `${chatId}:${taskId}`;
    if (this.taskCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.taskCache.keys().next().value as string | undefined;
      if (oldestKey) {
        this.taskCache.delete(oldestKey);
        Logger.info({ module: 'Cache', chatId, taskId }, `Removed oldest cache entry`);
      }
    }
    this.taskCache.set(key, { response, timestamp: Date.now() });
  }

  static canRunTask(): boolean {
    if (this.runningCount >= this.MAX_RUNNING_TASKS) {
      return false;
    }
    this.runningCount++;
    return true;
  }

  static endTask(): void {
    this.runningCount = Math.max(0, this.runningCount - 1);
  }

  static async addToQueue(chatId: string, taskId: string, bot: Telegraf<BotContext>, db: Database, isManual: boolean): Promise<string> {
    if (this.queue.length >= this.MAX_QUEUE_SIZE) {
      Logger.warn({ module: 'Cache', chatId, taskId }, `Queue is full`);
      return isManual ? 'Server is busy, please try again later.' : '';
    }
    const task = await getTaskById(db, parseInt(taskId));
    if (!task) {
      Logger.warn({ module: 'Cache', chatId, taskId }, `Task not found`);
      return isManual ? `Task with ID ${taskId} not found.` : '';
    }
    return new Promise((resolve) => {
      this.queue.push({ chatId, taskId, task, bot, db, isManual, resolve });
      if (isManual) bot.telegram.sendMessage(chatId, `Task "${task.name}" is queued, please wait...`);
      this.processQueue();
    });
  }

  private static processQueue(): void {
    if (this.queue.length === 0 || this.runningCount >= this.MAX_RUNNING_TASKS) return;

    const entry = this.queue.find(e => e.isManual) || this.queue.shift()!;
    const { chatId, taskId, task, bot, db, isManual, resolve } = entry;

    setTimeout(async () => {
      try {
        this.runningCount++;
        const result = await executeTask(task, bot, db, isManual);
        this.runningCount = Math.max(0, this.runningCount - 1);
        resolve(result);
        this.processQueue();
      } catch (err) {
        Logger.error({ module: 'Cache', chatId, taskId }, `Queue task error: ${(err as Error).message}`, err);
        this.runningCount = Math.max(0, this.runningCount - 1);
        resolve(isManual ? `Error executing task: ${(err as Error).message}` : '');
        this.processQueue();
      }
    }, isManual ? this.QUEUE_DELAY / 2 : this.QUEUE_DELAY);
  }

  static clearCache(): void {
    const now = Date.now();
    let cleared = 0;
    for (const [key, entry] of this.taskCache) {
      if (now - entry.timestamp > this.CACHE_TTL) {
        this.taskCache.delete(key);
        cleared++;
      }
    }
    if (cleared > 0) Logger.info({ module: 'Cache' }, `Cleared ${cleared} expired cache entries`);
  }

  static clearTaskCache(chatId: string, taskId: string): void {
    const key = `${chatId}:${taskId}`;
    if (this.taskCache.delete(key)) {
      Logger.info({ module: 'Cache', chatId, taskId }, `Cleared cache for task`);
    }
  }
}

setInterval(() => CacheManager.clearCache(), 60 * 1000);