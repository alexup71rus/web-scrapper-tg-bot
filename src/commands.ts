import { Telegraf, Context, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import { getTaskListKeyboard, getTaskActionsKeyboard, getEditTaskKeyboard } from './keyboard';
import { BotContext, TaskConfig, TaskDTO } from './types';
import { Database } from 'sql.js';
import * as fs from 'fs/promises';

export async function setupCommands(bot: Telegraf<BotContext>, dbPromise: Promise<Database>) {
  const db = await dbPromise;

  const tableExists = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'");
  if (!tableExists[0]?.values.length) {
    throw new Error('Table "tasks" not found. Run migrations first.');
  }

  async function saveDb() {
    try {
      const data = db.export();
      await fs.writeFile('./tasks.db', Buffer.from(data));
    } catch (err) {
      console.error('❌ Error saving database:', err);
    }
  }

  bot.command('start', async (ctx) => {
    ctx.session.awaitingCreate = false;
    ctx.session.awaitingEdit = null;
    ctx.session.deleteConfirm = null;
    await ctx.reply('Welcome to Web Scraper Bot! Use /create to add a task or /list to view tasks.');
  });

  bot.command('create', async (ctx) => {
    ctx.session.awaitingCreate = true;
    ctx.session.awaitingEdit = null;
    ctx.session.deleteConfirm = null;
    await ctx.reply(
      'Send JSON config for the task:\n```json\n' +
      JSON.stringify(
        {
          name: '#NAME#',
          ollama_host: 'http://localhost:11434',
          model: 'llama3',
          prompt: 'Summarize this content: {content}',
          duration: '* * * * *',
          tags: 'body > div,!.promo',
          url: 'https://example.com',
        },
        null,
        2
      ) +
      '\n```',
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('list', async (ctx) => {
    try {
      ctx.session.awaitingCreate = false;
      ctx.session.awaitingEdit = null;
      ctx.session.deleteConfirm = null;
      const stmt = db.prepare('SELECT * FROM tasks');
      const tasks: TaskConfig[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject() as unknown;
        if (isValidTaskConfig(row)) {
          tasks.push(row as TaskConfig);
        } else {
          console.error('❌ Invalid task data:', row);
        }
      }
      stmt.free();
      const message = await ctx.reply('Tasks:', getTaskListKeyboard(tasks, 1));
      ctx.session.listMessageId = message.message_id;
    } catch (err) {
      console.error('❌ Error in /list command:', err);
      await ctx.reply('Error displaying tasks.');
    }
  });

  bot.action(/task_(\d+)/, async (ctx) => {
    try {
      const taskId = parseInt(ctx.match[1]);
      const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
      stmt.bind([taskId]);
      const task = stmt.step() ? stmt.getAsObject() as unknown : null;
      stmt.free();
      if (task && isValidTaskConfig(task)) {
        await ctx.telegram.editMessageText(
          ctx.chat?.id,
          ctx.session.listMessageId,
          undefined,
          `Task: ${(task as TaskConfig).name}`,
          getTaskActionsKeyboard(taskId)
        ).catch(async () => {
          const message = await ctx.reply(`Task: ${(task as TaskConfig).name}`, getTaskActionsKeyboard(taskId));
          ctx.session.listMessageId = message.message_id;
        });
      }
      await ctx.answerCbQuery();
    } catch (err) {
      console.error('❌ Error in task action:', err);
      await ctx.reply('Error processing task action.');
    }
  });

  bot.action('back_to_list', async (ctx) => {
    try {
      const stmt = db.prepare('SELECT * FROM tasks');
      const tasks: TaskConfig[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject() as unknown;
        if (isValidTaskConfig(row)) {
          tasks.push(row as TaskConfig);
        } else {
          console.error('❌ Invalid task data:', row);
        }
      }
      stmt.free();
      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        ctx.session.listMessageId,
        undefined,
        'Tasks:',
        getTaskListKeyboard(tasks, 1)
      ).catch(async () => {
        const message = await ctx.reply('Tasks:', getTaskListKeyboard(tasks, 1));
        ctx.session.listMessageId = message.message_id;
      });
      await ctx.answerCbQuery();
    } catch (err) {
      console.error('❌ Error in back_to_list action:', err);
      await ctx.reply('Error returning to task list.');
    }
  });

  bot.action(/page_(\d+)/, async (ctx) => {
    try {
      const page = parseInt(ctx.match[1]);
      const stmt = db.prepare('SELECT * FROM tasks');
      const tasks: TaskConfig[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject() as unknown;
        if (isValidTaskConfig(row)) {
          tasks.push(row as TaskConfig);
        } else {
          console.error('❌ Invalid task data:', row);
        }
      }
      stmt.free();
      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        ctx.session.listMessageId,
        undefined,
        'Tasks:',
        getTaskListKeyboard(tasks, page)
      ).catch(async () => {
        const message = await ctx.reply('Tasks:', getTaskListKeyboard(tasks, page));
        ctx.session.listMessageId = message.message_id;
      });
      await ctx.answerCbQuery();
    } catch (err) {
      console.error('❌ Error in page action:', err);
      await ctx.reply('Error navigating to page.');
    }
  });

  bot.action(/action_(\d+)_(.+)/, async (ctx) => {
    try {
      const taskId = parseInt(ctx.match[1]);
      const action = ctx.match[2];
      if (action === 'edit') {
        ctx.session.awaitingEdit = taskId;
        ctx.session.awaitingCreate = false;
        ctx.session.deleteConfirm = null;
        const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
        stmt.bind([taskId]);
        const task = stmt.step() ? stmt.getAsObject() as unknown : null;
        stmt.free();
        if (task && isValidTaskConfig(task)) {
          await ctx.telegram.editMessageText(
            ctx.chat?.id,
            ctx.session.listMessageId,
            undefined,
            'Send updated JSON config for the task:\n```json\n' +
            JSON.stringify(task, null, 2) +
            '\n```',
            { parse_mode: 'Markdown', ...getEditTaskKeyboard(taskId) }
          ).catch(async () => {
            const message = await ctx.reply(
              'Send updated JSON config for the task:\n```json\n' +
              JSON.stringify(task, null, 2) +
              '\n```',
              { parse_mode: 'Markdown', ...getEditTaskKeyboard(taskId) }
            );
            ctx.session.listMessageId = message.message_id;
          });
        }
      } else if (action === 'delete') {
        ctx.session.deleteConfirm = taskId;
        await ctx.reply(
          'Are you sure you want to delete this task?',
          Markup.inlineKeyboard([
            Markup.button.callback('Confirm Delete', `confirm_delete_${taskId}`),
            Markup.button.callback('Cancel', 'cancel_delete')
          ])
        );
      } else {
        await ctx.reply(`Action "${action}" for task ${taskId} executed.`);
      }
      await ctx.answerCbQuery();
    } catch (err) {
      console.error('❌ Error in action:', err);
      await ctx.reply('Error executing action.');
    }
  });

  bot.action(/confirm_delete_(\d+)/, async (ctx) => {
    try {
      const taskId = parseInt(ctx.match[1]);
      if (ctx.session.deleteConfirm === taskId) {
        const stmt = db.prepare('DELETE FROM tasks WHERE id = ?');
        stmt.bind([taskId]);
        stmt.run();
        stmt.free();
        await saveDb();
        await ctx.reply('Task deleted successfully.');
        ctx.session.deleteConfirm = null;
        const stmtList = db.prepare('SELECT * FROM tasks');
        const tasks: TaskConfig[] = [];
        while (stmtList.step()) {
          const row = stmtList.getAsObject() as unknown;
          if (isValidTaskConfig(row)) {
            tasks.push(row as TaskConfig);
          } else {
            console.error('❌ Invalid task data:', row);
          }
        }
        stmtList.free();
        await ctx.telegram.editMessageText(
          ctx.chat?.id,
          ctx.session.listMessageId,
          undefined,
          'Tasks:',
          getTaskListKeyboard(tasks, 1)
        ).catch(async () => {
          const message = await ctx.reply('Tasks:', getTaskListKeyboard(tasks, 1));
          ctx.session.listMessageId = message.message_id;
        });
      }
      await ctx.answerCbQuery();
    } catch (err) {
      console.error('❌ Error in delete confirmation:', err);
      await ctx.reply('Error deleting task.');
    }
  });

  bot.action('cancel_delete', async (ctx) => {
    ctx.session.deleteConfirm = null;
    await ctx.reply('Delete cancelled.');
    await ctx.answerCbQuery();
  });

  bot.action('cancel_edit', async (ctx) => {
    try {
      const taskId = ctx.session.awaitingEdit;
      if (taskId) {
        const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
        stmt.bind([taskId]);
        const task = stmt.step() ? stmt.getAsObject() as unknown : null;
        stmt.free();
        if (task && isValidTaskConfig(task)) {
          await ctx.telegram.editMessageText(
            ctx.chat?.id,
            ctx.session.listMessageId,
            undefined,
            `Task: ${(task as TaskConfig).name}`,
            getTaskActionsKeyboard(taskId)
          ).catch(async () => {
            const message = await ctx.reply(`Task: ${(task as TaskConfig).name}`, getTaskActionsKeyboard(taskId));
            ctx.session.listMessageId = message.message_id;
          });
        }
        ctx.session.awaitingEdit = null;
      }
      await ctx.answerCbQuery();
    } catch (err) {
      console.error('❌ Error in cancel_edit action:', err);
      await ctx.reply('Error cancelling edit.');
    }
  });

  bot.on(message('text'), async (ctx) => {
    if (ctx.session.awaitingCreate && !ctx.message.text.startsWith('/')) {
      try {
        const config: TaskDTO = JSON.parse(ctx.message.text);
        if (isValidTaskDTO(config)) {
          const stmt = db.prepare(
            'INSERT INTO tasks (name, ollama_host, model, prompt, duration, tags, url) VALUES (?, ?, ?, ?, ?, ?, ?)'
          );
          stmt.bind([config.name, config.ollama_host, config.model, config.prompt, config.duration, config.tags, config.url]);
          stmt.run();
          stmt.free();
          await saveDb();
          await ctx.reply(`Task "${config.name}" added successfully! Use /list to view all tasks.`);
          ctx.session.awaitingCreate = false;
        } else {
          await ctx.reply('Invalid JSON format. Check all required fields.');
        }
      } catch (e: any) {
        await ctx.reply(`Error parsing JSON: ${e.message}`);
      }
    } else if (ctx.session.awaitingEdit && !ctx.message.text.startsWith('/')) {
      try {
        const config: TaskDTO = JSON.parse(ctx.message.text);
        if (isValidTaskDTO(config)) {
          const stmt = db.prepare(
            'UPDATE tasks SET name = ?, ollama_host = ?, model = ?, prompt = ?, duration = ?, tags = ?, url = ? WHERE id = ?'
          );
          stmt.bind([config.name, config.ollama_host, config.model, config.prompt, config.duration, config.tags, config.url, ctx.session.awaitingEdit]);
          stmt.run();
          stmt.free();
          await saveDb();
          await ctx.reply(`Task "${config.name}" updated successfully! Use /list to view all tasks.`);
          ctx.session.awaitingEdit = null;
          const stmtList = db.prepare('SELECT * FROM tasks');
          const tasks: TaskConfig[] = [];
          while (stmtList.step()) {
            const row = stmtList.getAsObject() as unknown;
            if (isValidTaskConfig(row)) {
              tasks.push(row as TaskConfig);
            } else {
              console.error('❌ Invalid task data:', row);
            }
          }
          stmtList.free();
          await ctx.telegram.editMessageText(
            ctx.chat?.id,
            ctx.session.listMessageId,
            undefined,
            'Tasks:',
            getTaskListKeyboard(tasks, 1)
          ).catch(async () => {
            const message = await ctx.reply('Tasks:', getTaskListKeyboard(tasks, 1));
            ctx.session.listMessageId = message.message_id;
          });
        } else {
          await ctx.reply('Invalid JSON format. Check all required fields.');
        }
      } catch (err) {
        console.error('❌ Error in edit submission:', err);
        await ctx.reply('Error updating task.');
      }
    }
  });
}

function isValidTaskConfig(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false;
  const task = row as Record<string, unknown>;
  return (
    typeof task.id === 'number' &&
    typeof task.name === 'string' &&
    typeof task.ollama_host === 'string' &&
    typeof task.model === 'string' &&
    typeof task.prompt === 'string' &&
    typeof task.duration === 'string' &&
    typeof task.tags === 'string' &&
    typeof task.url === 'string'
  );
}

function isValidTaskDTO(config: any): config is TaskDTO {
  return (
    typeof config.name === 'string' &&
    typeof config.ollama_host === 'string' &&
    typeof config.model === 'string' &&
    typeof config.prompt === 'string' &&
    typeof config.duration === 'string' &&
    typeof config.tags === 'string' &&
    typeof config.url === 'string'
  );
}