import { BotContext } from '../../types';
import { Database } from 'sql.js';
import { getEditTaskKeyboard, getTaskListKeyboard } from '../../keyboard';
import { Markup } from 'telegraf';
import { executeTask } from '../../scheduler';
import { Telegraf } from 'telegraf';
import { getTaskById, getTasks } from '../../services/database';
import { Logger } from '../../utils/logger';

export async function handleAction(ctx: BotContext, db: Database, bot: Telegraf<BotContext>) {
  const context = { module: 'Action', taskId: ctx.match?.[1], chatId: ctx.chat?.id?.toString() };
  try {
    if (!ctx.match) {
      Logger.error(context, 'No match data for action');
      throw new Error('No match data for action');
    }
    if (!ctx.chat?.id) {
      Logger.error(context, 'Chat ID not found');
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
        const configText = [
          `id=${task.id}`,
          `name=${task.name}`,
          `url=${task.url}`,
          task.tags ? `tags=${task.tags}` : 'tags=body',
          `schedule=${task.raw_schedule || task.schedule}`,
          `alert_if_true=${task.alert_if_true || 'no'}`,
          `prompt=${task.prompt}`,
          `chatId=${task.chatId}`,
        ].join('\n');
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          ctx.session.listMessageId,
          undefined,
          'Send updated key-value config for the task (include "id" to update):\n```\n' +
            configText +
            '\n```',
          { parse_mode: 'Markdown', ...getEditTaskKeyboard() }
        ).catch(async () => {
          const message = await ctx.reply(
            'Send updated key-value config for the task (include "id" to update):\n```\n' +
              configText +
              '\n```',
            { parse_mode: 'Markdown', ...getEditTaskKeyboard() }
          );
          ctx.session.listMessageId = message.message_id;
        });
      } else {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          ctx.session.listMessageId,
          undefined,
          `Task with ID ${taskId} not found.\nTasks:`,
          getTaskListKeyboard(await getTasks(db), 1)
        ).catch(async () => {
          const message = await ctx.reply(`Task with ID ${taskId} not found.\nTasks:`, getTaskListKeyboard(await getTasks(db), 1));
          ctx.session.listMessageId = message.message_id;
        });
      }
      await ctx.answerCbQuery();
    } else if (action === 'delete') {
      ctx.session.deleteConfirm = taskId;
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        ctx.session.listMessageId,
        undefined,
        'Are you sure you want to delete this task?',
        Markup.inlineKeyboard([
          Markup.button.callback('Confirm Delete', `confirm_delete_${taskId}`),
          Markup.button.callback('Cancel', `cancel_delete`),
        ])
      ).catch(async () => {
        const message = await ctx.reply(
          'Are you sure you want to delete this task?',
          Markup.inlineKeyboard([
            Markup.button.callback('Confirm Delete', `confirm_delete_${taskId}`),
            Markup.button.callback('Cancel', `cancel_delete`),
          ])
        );
        ctx.session.listMessageId = message.message_id;
      });
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
        const result = await executeTask(task, bot, true);
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          ctx.session.listMessageId,
          undefined,
          result,
          getTaskListKeyboard(await getTasks(db), 1)
        ).catch(async () => {
          const message = await ctx.reply(result, getTaskListKeyboard(await getTasks(db), 1));
          ctx.session.listMessageId = message.message_id;
        });
      } else {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          ctx.session.listMessageId,
          undefined,
          `Task with ID ${taskId} not found.\nTasks:`,
          getTaskListKeyboard(await getTasks(db), 1)
        ).catch(async () => {
          const message = await ctx.reply(`Task with ID ${taskId} not found.\nTasks:`, getTaskListKeyboard(await getTasks(db), 1));
          ctx.session.listMessageId = message.message_id;
        });
        await ctx.answerCbQuery();
      }
    } else {
      Logger.warn({ ...context, taskId }, `Action "${action}" not recognized`);
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        ctx.session.listMessageId,
        undefined,
        `Action "${action}" not recognized.\nTasks:`,
        getTaskListKeyboard(await getTasks(db), 1)
      ).catch(async () => {
        const message = await ctx.reply(`Action "${action}" not recognized.\nTasks:`, getTaskListKeyboard(await getTasks(db), 1));
        ctx.session.listMessageId = message.message_id;
      });
      await ctx.answerCbQuery();
    }
  } catch (err) {
    Logger.error(context, `Error processing action for task ${ctx.match?.[1] || 'unknown'}`, err);
    if (ctx.chat) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        ctx.session.listMessageId,
        undefined,
        `Error executing action: ${(err as Error).message}\nTasks:`,
        getTaskListKeyboard(await getTasks(db), 1)
      ).catch(async () => {
        const message = await ctx.reply(`Error executing action: ${(err as Error).message}\nTasks:`, getTaskListKeyboard(await getTasks(db), 1));
        ctx.session.listMessageId = message.message_id;
      });
    } else {
      Logger.error(context, 'Chat context missing, cannot send error message');
    }
    await ctx.answerCbQuery();
  }
}