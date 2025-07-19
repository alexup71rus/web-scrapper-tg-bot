import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { BotContext, TaskDTO } from '../types';
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
import { saveDb, getTasks, getTaskById } from '../services/database';
import { TaskValidator } from '../utils/taskValidator';
import { getTaskListKeyboard } from '../keyboard';
import * as cron from 'node-cron';
import { scheduleTasks } from '../scheduler';
import { Logger } from '../utils/logger';
import {CacheManager} from "../utils/cache";

async function sendOrEditMessage(
  ctx: BotContext,
  chatId: number,
  messageId: number | undefined,
  text: string,
  replyMarkup?: any
) {
  try {
    const message = await ctx.telegram.editMessageText(chatId, messageId, undefined, text, replyMarkup);
    if (typeof message !== 'boolean') ctx.session.listMessageId = message.message_id;
    return message;
  } catch {
    const message = await ctx.reply(text, replyMarkup);
    ctx.session.listMessageId = message.message_id;
    return message;
  }
}

export async function setupCommands(bot: Telegraf<BotContext>, db: Database) {
  try {
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
    bot.action(/confirm_delete_(\d+)/, (ctx) => handleConfirmDelete(ctx, db, bot));
    bot.action('cancel_delete', (ctx) => handleCancelDelete(ctx, db));
    bot.action('cancel_edit', (ctx) => handleCancelEdit(ctx, db));

    bot.on(message('text'), async (ctx) => {
      try {
        if (!ctx.chat?.id) {
          Logger.error({ module: 'Commands', chatId: ctx.chat?.id?.toString() }, 'Chat ID not found');
          await ctx.reply('Error: Chat ID not found.');
          return;
        }

        const config = TaskValidator.parseKeyValueConfig(ctx.message.text, ctx.chat.id.toString());
        if (Object.keys(config).length === 0) {
          Logger.warn({ module: 'Commands', chatId: ctx.chat.id.toString() }, `No valid configuration parsed from: ${ctx.message.text}`);
          if (ctx.session.awaitingCreate || ctx.session.awaitingEdit) {
            await ctx.reply('Invalid configuration format. Please send a valid key-value config.');
          }
          return;
        }

        const taskConfig: Partial<TaskDTO> = {
          ...config,
          chatId: ctx.chat.id.toString(),
          schedule: config.schedule ? TaskValidator.convertScheduleToCron(config.schedule) : undefined,
          raw_schedule: config.schedule,
        };

        if (!TaskValidator.isValidTask(taskConfig)) {
          Logger.warn({ module: 'Commands', chatId: ctx.chat.id.toString() }, 'Invalid task configuration');
          await ctx.reply('Invalid task configuration. Check provided fields.');
          return;
        }

        if (!taskConfig.id && !ctx.session.awaitingEdit) {
          const validatedConfig: TaskDTO = {
            id: 0, // Temporary, will be assigned
            name: taskConfig.name!,
            prompt: taskConfig.prompt!,
            url: taskConfig.url,
            tags: taskConfig.tags,
            schedule: taskConfig.schedule,
            raw_schedule: taskConfig.raw_schedule,
            alert_if_true: taskConfig.alert_if_true,
            chatId: taskConfig.chatId!,
          };

          let newId: number | undefined;
          try {
            const maxIdStmt = db.prepare('SELECT MAX(id) as maxId FROM tasks');
            maxIdStmt.step();
            const maxIdResult = maxIdStmt.getAsObject();
            newId = maxIdResult.maxId ? Number(maxIdResult.maxId) + 1 : 1;
            maxIdStmt.free();

            const stmt = db.prepare(
              'INSERT INTO tasks (id, name, url, tags, schedule, raw_schedule, alert_if_true, prompt, chatId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            stmt.bind([
              newId,
              taskConfig.name ?? null,
              taskConfig.url ?? null,
              taskConfig.tags ?? null,
              taskConfig.schedule ?? null,
              taskConfig.raw_schedule ?? null,
              taskConfig.alert_if_true ?? 'no',
              taskConfig.prompt ?? null,
              taskConfig.chatId!,
            ]);
            stmt.run();
            stmt.free();

            await saveDb(db);

            const tasks = await getTasks(db);
            const newTask = tasks.find(t => t.id === newId && t.chatId === taskConfig.chatId);
            if (newTask && newTask.schedule && cron.validate(newTask.schedule)) {
              await scheduleTasks(bot, db);
              await ctx.reply(`Task "${taskConfig.name}" added successfully with ID ${newId}! Use /list to view all tasks.`);
            } else {
              await ctx.reply(`Task "${taskConfig.name}" added successfully with ID ${newId} for manual execution. Use /list to view all tasks.`);
            }
          } catch (err) {
            Logger.error({ module: 'Commands', taskId: newId, chatId: ctx.chat.id.toString() }, 'Error inserting task', err);
            await ctx.reply(`Error inserting task: ${(err as Error).message}`);
            return;
          }
          if (newId === undefined) {
            Logger.error({ module: 'Commands', chatId: ctx.chat.id.toString() }, 'Failed to assign newId for task');
            await ctx.reply('Error creating task: Failed to assign task ID.');
            return;
          }
        } else {
          if (!taskConfig.id) {
            Logger.warn({ module: 'Commands', chatId: ctx.chat.id.toString() }, 'Missing id for editing task');
            await ctx.reply('Missing id for editing task.');
            return;
          }
          const existingTask = await getTaskById(db, taskConfig.id);
          if (!existingTask) {
            await ctx.reply(`Task with ID ${taskConfig.id} not found.`);
            return;
          }
          if (!TaskValidator.isValidTaskConfigForEdit(taskConfig)) {
            Logger.warn({ module: 'Commands', chatId: ctx.chat.id.toString() }, 'Invalid task configuration for edit');
            await ctx.reply('Invalid task configuration for edit. Check all provided fields.');
            return;
          }
          try {
            const stmt = db.prepare(
              'UPDATE tasks SET name = ?, url = ?, tags = ?, schedule = ?, raw_schedule = ?, alert_if_true = ?, prompt = ? WHERE id = ?'
            );
            stmt.bind([
              taskConfig.name ?? existingTask.name,
              taskConfig.url ?? existingTask.url ?? null,
              taskConfig.tags ?? existingTask.tags ?? null,
              taskConfig.schedule ?? existingTask.schedule ?? null,
              taskConfig.raw_schedule ?? existingTask.raw_schedule ?? null,
              taskConfig.alert_if_true ?? existingTask.alert_if_true ?? 'no',
              taskConfig.prompt ?? existingTask.prompt,
              taskConfig.id!,
            ]);
            stmt.run();
            stmt.free();
            await saveDb(db);
            CacheManager.clearTaskCache(taskConfig.chatId!, taskConfig.id!.toString());
          } catch (err) {
            Logger.error({ module: 'Commands', taskId: taskConfig.id, chatId: ctx.chat.id.toString() }, 'Error updating task', err);
            await sendOrEditMessage(
              ctx,
              ctx.chat.id,
              ctx.session.listMessageId,
              `Error updating task: ${(err as Error).message}`,
              getTaskListKeyboard(await getTasks(db), 1)
            );
            return;
          }

          const task = await getTaskById(db, taskConfig.id);
          if (task && task.schedule && cron.validate(task.schedule)) {
            await scheduleTasks(bot, db);
            await ctx.reply(`Task "${taskConfig.name ?? existingTask.name}" updated successfully! Use /list to view all tasks.`);
          } else {
            await ctx.reply(`Task "${taskConfig.name ?? existingTask.name}" updated successfully for manual execution. Use /list to view all tasks.`);
          }
        }

        ctx.session.awaitingCreate = false;
        ctx.session.awaitingEdit = null;

        const tasks = await getTasks(db);
        await sendOrEditMessage(
          ctx,
          ctx.chat.id,
          ctx.session.listMessageId,
          'Tasks:',
          getTaskListKeyboard(tasks, 1)
        );
      } catch (err) {
        Logger.error({ module: 'Commands', chatId: ctx.chat?.id?.toString() }, 'Error processing configuration', err);
        await ctx.reply(`Error processing configuration: ${(err as Error).message}`);
      }
    });
  } catch (err) {
    Logger.error({ module: 'Commands' }, 'Error setting up bot commands', err);
    throw new Error(`Failed to set up bot commands: ${(err as Error).message}`);
  }
}