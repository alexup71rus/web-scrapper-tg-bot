import { BotContext, TaskConfig } from '../../types';
import { Database } from 'sql.js';
import { getEditTaskKeyboard } from '../../keyboard';
import { Markup } from 'telegraf';
import { executeTask } from '../../scheduler';
import { Telegraf } from 'telegraf';
import { getTaskById } from '../../services/database';

export async function handleAction(ctx: BotContext, db: Database, bot: Telegraf<BotContext>) {
  try {
    if (!ctx.match) {
      throw new Error('No match data for action');
    }
    if (!ctx.chat?.id) {
      throw new Error('Chat ID not found');
    }
    const taskId = parseInt(ctx.match[1]);
    const action = ctx.match[2];
    if (action === 'edit') {
      ctx.session.awaitingEdit = taskId;
      ctx.session.awaitingCreate = false;
      ctx.session.deleteConfirm = null;
      const task = await getTaskById(db, taskId);
      if (task) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          ctx.session.listMessageId,
          undefined,
          'Send updated JSON config for the task (include "id" to update, omit to create new):\n```json\n' +
          JSON.stringify(task, null, 2) +
          '\n```',
          { parse_mode: 'Markdown', ...getEditTaskKeyboard() }
        ).catch(async () => {
          const message = await ctx.reply(
            'Send updated JSON config for the task (include "id" to update, omit to create new):\n```json\n' +
            JSON.stringify(task, null, 2) +
            '\n```',
            { parse_mode: 'Markdown', ...getEditTaskKeyboard() }
          );
          ctx.session.listMessageId = message.message_id;
        });
      }
      await ctx.answerCbQuery();
    } else if (action === 'delete') {
      ctx.session.deleteConfirm = taskId;
      await ctx.reply(
        'Are you sure you want to delete this task?',
        Markup.inlineKeyboard([
          Markup.button.callback('Confirm Delete', `confirm_delete_${taskId}`),
          Markup.button.callback('Cancel', `cancel_delete`)
        ])
      );
      await ctx.answerCbQuery();
    } else if (action === 'run') {
      const task = await getTaskById(db, taskId);
      if (task) {
        await ctx.answerCbQuery();
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          ctx.session.listMessageId,
          undefined,
          `Executing "${task.name}", please wait...`
        ).catch(async () => {
          const message = await ctx.reply(`Executing "${task.name}", please wait...`);
          ctx.session.listMessageId = message.message_id;
        });
        const result = await executeTask(task, bot);
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          ctx.session.listMessageId,
          undefined,
          result
        ).catch(async () => {
          const message = await ctx.reply(result);
          ctx.session.listMessageId = message.message_id;
        });
      } else {
        await ctx.reply(`Task with ID ${taskId} not found.`);
        await ctx.answerCbQuery();
      }
    } else {
      await ctx.reply(`Action "${action}" not recognized.`);
      await ctx.answerCbQuery();
    }
  } catch (err) {
    console.error('❌ Error in action:', err);
    await ctx.reply('Error executing action.');
  }
}