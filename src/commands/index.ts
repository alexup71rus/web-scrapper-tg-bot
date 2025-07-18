import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { BotContext, TaskConfig, TaskDTO } from '../types';
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
import { isValidTaskDTO, isValidTaskConfigForEdit, parseKeyValueConfig, convertScheduleToCron, isValidUrl } from '../utils/validation';
import { getTaskListKeyboard } from '../keyboard';
import * as cron from 'node-cron';
import { scheduleTasks } from '../scheduler';

export async function setupCommands(bot: Telegraf<BotContext>, db: Database) {
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
  bot.action('cancel_delete', (ctx) => handleCancelDelete(ctx));
  bot.action('cancel_edit', (ctx) => handleCancelEdit(ctx, db));

  bot.on(message('text'), async (ctx) => {
    try {
      if (!ctx.chat?.id) {
        await ctx.reply('Error: Chat ID not found.');
        return;
      }

      // Проверяем, является ли сообщение конфигурацией ключ-значение
      const config = parseKeyValueConfig(ctx.message.text);
      const isConfigFormat = Object.keys(config).length > 0; // Проверяем, что парсинг вернул непустой объект
      if (!isConfigFormat) {
        if (ctx.session.awaitingCreate || ctx.session.awaitingEdit) {
          await ctx.reply('Invalid configuration format. Please send a valid key-value config.');
        }
        return;
      }

      const taskConfig: Partial<TaskDTO> = {
        ...config,
        chatId: ctx.chat.id.toString(),
        schedule: config.schedule ? convertScheduleToCron(config.schedule) : undefined,
        raw_schedule: config.schedule,
      };

      // Validate required fields and types
      if (taskConfig.id && isNaN(Number(taskConfig.id))) {
        await ctx.reply('Invalid id. Must be a number.');
        return;
      }
      if (!taskConfig.name) {
        await ctx.reply('Missing name. Must be a string.');
        return;
      }
      if (!taskConfig.url || !isValidUrl(taskConfig.url)) {
        await ctx.reply('Invalid or missing URL. Must be a valid URL (e.g., https://example.com).');
        return;
      }
      if (!taskConfig.prompt || !taskConfig.prompt.includes('{content}')) {
        await ctx.reply('Invalid or missing prompt. Must include {content}.');
        return;
      }
      if (!taskConfig.schedule || !cron.validate(taskConfig.schedule)) {
        await ctx.reply('Invalid or missing schedule. Use "daily HH:MM" or a valid cron expression.');
        return;
      }
      if (taskConfig.alert_if_true && !['yes', 'no'].includes(taskConfig.alert_if_true)) {
        await ctx.reply('Invalid alert_if_true. Must be "yes" or "no".');
        return;
      }
      if (!taskConfig.chatId) {
        await ctx.reply('Invalid chatId. Must be a string.');
        return;
      }

      if (!taskConfig.id && !ctx.session.awaitingEdit) {
        // Creating a new task
        if (!isValidTaskDTO({ ...taskConfig, id: 0 })) { // Temporary id for validation
          await ctx.reply('Invalid task configuration. All fields except id are required.');
          console.log('Validation failed for taskConfig:', taskConfig);
          return;
        }
        // Generate a unique id
        const maxIdStmt = db.prepare('SELECT MAX(id) as maxId FROM tasks');
        maxIdStmt.step();
        const maxIdResult = maxIdStmt.getAsObject();
        const newId = maxIdResult.maxId ? Number(maxIdResult.maxId) + 1 : 1;
        maxIdStmt.free();

        console.log('Inserting task with config:', { ...taskConfig, id: newId });

        const stmt = db.prepare(
          'INSERT INTO tasks (id, name, url, tags, schedule, raw_schedule, alert_if_true, prompt, chatId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        stmt.bind([
          newId,
          taskConfig.name,
          taskConfig.url,
          taskConfig.tags || 'body',
          taskConfig.schedule,
          taskConfig.raw_schedule || taskConfig.schedule,
          taskConfig.alert_if_true || 'no',
          taskConfig.prompt,
          taskConfig.chatId,
        ]);
        stmt.run();
        stmt.free();
        await saveDb(db);

        console.log('Database saved, fetching tasks...');
        const tasks = await getTasks(db);
        console.log('Tasks after insert:', tasks);

        const newTask = tasks.find(t => t.id === newId && t.chatId === taskConfig.chatId);
        if (newTask && newTask.schedule && cron.validate(newTask.schedule)) {
          await scheduleTasks(bot, db);
          await ctx.reply(`Task "${taskConfig.name}" added successfully with ID ${newId}! Use /list to view all tasks.`);
        } else {
          await ctx.reply(`Task "${taskConfig.name}" added to database but not scheduled or not found.`);
          console.error(`Failed to schedule or find new task ${taskConfig.name}:`, newTask);
        }
      } else {
        // Editing a task
        if (!taskConfig.id) {
          await ctx.reply('Missing id for editing task.');
          return;
        }
        const existingTask = await getTaskById(db, taskConfig.id);
        if (!existingTask) {
          await ctx.reply(`Task with ID ${taskConfig.id} not found.`);
          return;
        }
        if (!isValidTaskConfigForEdit(taskConfig)) {
          await ctx.reply('Invalid task configuration for edit. Check all provided fields.');
          return;
        }
        console.log('Updating task with config:', taskConfig);
        const stmt = db.prepare(
          'UPDATE tasks SET name = ?, url = ?, tags = ?, schedule = ?, raw_schedule = ?, alert_if_true = ?, prompt = ?, chatId = ? WHERE id = ?'
        );
        stmt.bind([
          taskConfig.name,
          taskConfig.url,
          taskConfig.tags || 'body',
          taskConfig.schedule,
          taskConfig.raw_schedule || taskConfig.schedule,
          taskConfig.alert_if_true || 'no',
          taskConfig.prompt,
          taskConfig.chatId,
          taskConfig.id,
        ]);
        stmt.run();
        stmt.free();
        await saveDb(db);

        console.log('Database saved, fetching updated task...');
        const task = await getTaskById(db, taskConfig.id);
        console.log('Updated task:', task);

        if (task && task.schedule && cron.validate(task.schedule)) {
          await scheduleTasks(bot, db);
          await ctx.reply(`Task "${taskConfig.name}" updated successfully! Use /list to view all tasks.`);
        } else {
          await ctx.reply(`Task "${taskConfig.name}" updated in database but not scheduled or not found.`);
          console.error(`Failed to schedule or find task ${taskConfig.id}:`, task);
        }
      }

      ctx.session.awaitingCreate = false;
      ctx.session.awaitingEdit = null;

      const tasks = await getTasks(db);
      console.log('Tasks after operation:', tasks);
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
    } catch (e: any) {
      console.error('Error processing configuration:', e.message);
      await ctx.reply(`Error processing configuration: ${e.message}`);
    }
  });
}