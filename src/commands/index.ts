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

        if (taskConfig.id && isNaN(Number(taskConfig.id))) {
          Logger.warn({ module: 'Commands', chatId: ctx.chat.id.toString() }, 'Invalid id. Must be a number');
          await ctx.reply('Invalid id. Must be a number.');
          return;
        }
        if (!taskConfig.name) {
          Logger.warn({ module: 'Commands', chatId: ctx.chat.id.toString() }, 'Missing name. Must be a string');
          await ctx.reply('Missing name. Must be a string.');
          return;
        }
        if (!taskConfig.url || !TaskValidator.isValidUrl(taskConfig.url)) {
          Logger.warn({ module: 'Commands', chatId: ctx.chat.id.toString() }, 'Invalid or missing URL');
          await ctx.reply('Invalid or missing URL. Must be a valid URL (e.g., https://example.com).');
          return;
        }
        if (!taskConfig.prompt || !taskConfig.prompt.includes('{content}')) {
          Logger.warn({ module: 'Commands', chatId: ctx.chat.id.toString() }, 'Invalid or missing prompt');
          await ctx.reply('Invalid or missing prompt. Must include {content}.');
          return;
        }
        if (!taskConfig.schedule || !cron.validate(taskConfig.schedule)) {
          Logger.warn({ module: 'Commands', chatId: ctx.chat.id.toString() }, 'Invalid or missing schedule');
          await ctx.reply('Invalid or missing schedule. Use "daily HH:MM" or a valid cron expression.');
          return;
        }
        if (taskConfig.alert_if_true && !['yes', 'no'].includes(taskConfig.alert_if_true)) {
          Logger.warn({ module: 'Commands', chatId: ctx.chat.id.toString() }, 'Invalid alert_if_true');
          await ctx.reply('Invalid alert_if_true. Must be "yes" or "no".');
          return;
        }
        if (!taskConfig.chatId) {
          Logger.warn({ module: 'Commands', chatId: ctx.chat.id.toString() }, 'Invalid chatId');
          await ctx.reply('Invalid chatId. Must be a string.');
          return;
        }

        if (!taskConfig.id && !ctx.session.awaitingEdit) {
          if (!TaskValidator.isValidTaskDTO({ ...taskConfig, id: 0 })) {
            Logger.error({ module: 'Commands', chatId: ctx.chat.id.toString() }, 'Validation failed for new task configuration', taskConfig);
            await ctx.reply('Invalid task configuration. All fields except id are required.');
            return;
          }
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
              taskConfig.name!,
              taskConfig.url!,
              taskConfig.tags || 'body',
              taskConfig.schedule!,
              taskConfig.raw_schedule || taskConfig.schedule || null,
              taskConfig.alert_if_true || 'no',
              taskConfig.prompt!,
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
              Logger.error(
                { module: 'Commands', taskId: newId, chatId: ctx.chat.id.toString() },
                `Failed to schedule or find new task "${taskConfig.name}"`,
                newTask
              );
              await ctx.reply(`Task "${taskConfig.name}" added to database but not scheduled or not found.`);
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
              'UPDATE tasks SET name = ?, url = ?, tags = ?, schedule = ?, raw_schedule = ?, alert_if_true = ?, prompt = ?, chatId = ? WHERE id = ?'
            );
            stmt.bind([
              taskConfig.name ?? existingTask.name,
              taskConfig.url ?? existingTask.url,
              taskConfig.tags || 'body',
              taskConfig.schedule ?? existingTask.schedule,
              taskConfig.raw_schedule || taskConfig.schedule || existingTask.raw_schedule || null,
              taskConfig.alert_if_true || 'no',
              taskConfig.prompt ?? existingTask.prompt,
              taskConfig.chatId ?? existingTask.chatId,
              taskConfig.id!,
            ]);
            stmt.run();
            stmt.free();
            await saveDb(db);
          } catch (err) {
            Logger.error({ module: 'Commands', taskId: taskConfig.id, chatId: ctx.chat.id.toString() }, 'Error updating task', err);
            await ctx.reply(`Error updating task: ${(err as Error).message}`);
            return;
          }

          const task = await getTaskById(db, taskConfig.id);
          if (task && task.schedule && cron.validate(task.schedule)) {
            await scheduleTasks(bot, db);
            await ctx.reply(`Task "${taskConfig.name ?? existingTask.name}" updated successfully! Use /list to view all tasks.`);
          } else {
            Logger.error(
              { module: 'Commands', taskId: taskConfig.id, chatId: ctx.chat.id.toString() },
              `Failed to schedule or find task ${taskConfig.id}`,
              task
            );
            await ctx.reply(`Task "${taskConfig.name ?? existingTask.name}" updated in database but not scheduled or not found.`);
          }
        }

        ctx.session.awaitingCreate = false;
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