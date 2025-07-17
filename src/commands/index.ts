import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import {BotContext, TaskConfig, TaskDTO} from '../types';
import { Database } from 'sql.js';
import { handleStart } from './start';
import { handleCreate } from './create';
import { handleList } from './list';
import { handleTask } from './actions/task';
import { handleBackToList } from './actions/backToList';
import { handlePage } from './actions/page';
import { handleAction } from './actions/action';
import { handleConfirmDelete, handleCancelDelete } from './actions/delete';
import { handleCancelEdit } from './actions/edit';
import { saveDb, getTasks } from '../services/database';
import { isValidTaskDTO, isValidTaskConfigForEdit } from '../utils/validation';
import { getTaskListKeyboard } from '../keyboard';
import * as cron from 'node-cron';

export async function setupCommands(bot: Telegraf<BotContext>, dbPromise: Promise<Database>) {
  const db = await dbPromise;

  const tableExists = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'");
  if (!tableExists[0]?.values.length) {
    throw new Error('Table "tasks" not found. Run migrations first.');
  }

  bot.command('start', (ctx) => handleStart(ctx));
  bot.command('create', (ctx) => handleCreate(ctx));
  bot.command('list', (ctx) => handleList(ctx, db));
  bot.action(/task_(\d+)/, (ctx) => handleTask(ctx, db));
  bot.action('back_to_list', (ctx) => handleBackToList(ctx, db));
  bot.action(/page_(\d+)/, (ctx) => handlePage(ctx, db));
  bot.action(/action_(\d+)_(.+)/, (ctx) => handleAction(ctx, db, bot));
  bot.action(/confirm_delete_(\d+)/, (ctx) => handleConfirmDelete(ctx, db));
  bot.action('cancel_delete', (ctx) => handleCancelDelete(ctx));
  bot.action('cancel_edit', (ctx) => handleCancelEdit(ctx, db));

  bot.on(message('text'), async (ctx) => {
    try {
      if (!ctx.chat?.id) {
        await ctx.reply('Error: Chat ID not found.');
        return;
      }
      if (ctx.session.awaitingCreate) {
        const config: Partial<TaskDTO> = JSON.parse(ctx.message.text);
        const taskConfig = { ...config, chatId: ctx.chat.id };
        if (!isValidTaskDTO(taskConfig) || !cron.validate(taskConfig.duration)) {
          await ctx.reply('Invalid JSON format or cron expression. Check all required fields.');
          return;
        }
        const stmt = db.prepare(
          'INSERT INTO tasks (name, ollama_host, model, prompt, duration, tags, url, chatId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        stmt.bind([taskConfig.name, taskConfig.ollama_host, taskConfig.model, taskConfig.prompt, taskConfig.duration, taskConfig.tags, taskConfig.url, taskConfig.chatId]);
        stmt.run();
        stmt.free();
        await saveDb(db);
        await ctx.reply(`Task "${taskConfig.name}" added successfully! Use /list to view all tasks.`);
        ctx.session.awaitingCreate = false;
      } else if (ctx.session.awaitingEdit) {
        const config: Partial<TaskConfig> = JSON.parse(ctx.message.text);
        if (typeof config.id !== 'number' || config.id !== ctx.session.awaitingEdit) {
          const taskConfig = { ...config, chatId: ctx.chat.id };
          if (!isValidTaskDTO(taskConfig) || !cron.validate(taskConfig.duration)) {
            await ctx.reply('Invalid JSON format or cron expression. Check all required fields.');
            return;
          }
          const stmt = db.prepare(
            'INSERT INTO tasks (name, ollama_host, model, prompt, duration, tags, url, chatId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          );
          stmt.bind([taskConfig.name, taskConfig.ollama_host, taskConfig.model, taskConfig.prompt, taskConfig.duration, taskConfig.tags, taskConfig.url, taskConfig.chatId]);
          stmt.run();
          stmt.free();
          await saveDb(db);
          await ctx.reply(`Task "${taskConfig.name}" added successfully! Use /list to view all tasks.`);
          ctx.session.awaitingEdit = null;
        } else {
          const taskConfig = { ...config, chatId: ctx.chat.id };
          if (!isValidTaskConfigForEdit(taskConfig) || !cron.validate(taskConfig.duration)) {
            await ctx.reply('Invalid JSON format or cron expression. Check all required fields.');
            return;
          }
          const stmt = db.prepare(
            'UPDATE tasks SET name = ?, ollama_host = ?, model = ?, prompt = ?, duration = ?, tags = ?, url = ?, chatId = ? WHERE id = ?'
          );
          stmt.bind([taskConfig.name, taskConfig.ollama_host, taskConfig.model, taskConfig.prompt, taskConfig.duration, taskConfig.tags, taskConfig.url, taskConfig.chatId, ctx.session.awaitingEdit]);
          stmt.run();
          stmt.free();
          await saveDb(db);
          await ctx.reply(`Task "${taskConfig.name}" updated successfully! Use /list to view all tasks.`);
          ctx.session.awaitingEdit = null;
          const tasks = await getTasks(db);
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            ctx.session.listMessageId,
            undefined,
            'Tasks:',
            getTaskListKeyboard(tasks, 1)
          ).catch(async () => {
            const message = await ctx.reply('Tasks:', getTaskListKeyboard(tasks, 1));
            ctx.session.listMessageId = message.message_id;
          });
        }
      }
    } catch (e: any) {
      await ctx.reply(`Error parsing JSON: ${e.message}`);
    }
  });
}