import { BotContext } from '../../types';
import { Database } from 'sql.js';
import { getEditTaskKeyboard, getTaskListKeyboard } from '../../keyboard';
import { Markup } from 'telegraf';
import { executeTask } from '../../scheduler';
import { Telegraf } from 'telegraf';
import { getTaskById, getTasks } from '../../services/database';
import { Logger } from '../../utils/logger';

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
    const chatId = ctx.chat.id.toString();

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
        ].join('\n');
        await sendOrEditMessage(
          ctx,
          ctx.chat.id,
          ctx.session.listMessageId,
          'Send updated key-value config for the task (include "id" to update):\n```\n' + configText + '\n```',
          { parse_mode: 'Markdown', ...getEditTaskKeyboard() }
        );
      } else {
        await sendOrEditMessage(
          ctx,
          ctx.chat.id,
          ctx.session.listMessageId,
          `Task with ID ${taskId} not found.\nTasks:`,
          getTaskListKeyboard(await getTasks(db), 1)
        );
      }
      await ctx.answerCbQuery();
    } else if (action === 'delete') {
      ctx.session.deleteConfirm = taskId;
      await sendOrEditMessage(
        ctx,
        ctx.chat.id,
        ctx.session.listMessageId,
        'Are you sure you want to delete this task?',
        Markup.inlineKeyboard([
          Markup.button.callback('Confirm Delete', `confirm_delete_${taskId}`),
          Markup.button.callback('Cancel', `cancel_delete`),
        ])
      );
      await ctx.answerCbQuery();
    } else if (action === 'run') {
      const task = await getTaskById(db, taskId);
      if (!task) {
        await sendOrEditMessage(
          ctx,
          ctx.chat.id,
          ctx.session.listMessageId,
          `Task with ID ${taskId} not found.\nTasks:`,
          getTaskListKeyboard(await getTasks(db), 1)
        );
        await ctx.answerCbQuery();
        return;
      }

      await ctx.answerCbQuery();
      await sendOrEditMessage(
        ctx,
        ctx.chat.id,
        ctx.session.listMessageId,
        `Executing "${task.name}", please wait...`
      );

      const result = await executeTask(task, bot, db, true);
      await sendOrEditMessage(
        ctx,
        ctx.chat.id,
        ctx.session.listMessageId,
        result,
        getTaskListKeyboard(await getTasks(db), 1)
      );
    } else {
      Logger.warn(context, `Action "${action}" not recognized`);
      await sendOrEditMessage(
        ctx,
        ctx.chat.id,
        ctx.session.listMessageId,
        `Action "${action}" not recognized.\nTasks:`,
        getTaskListKeyboard(await getTasks(db), 1)
      );
      await ctx.answerCbQuery();
    }
  } catch (err) {
    Logger.error(context, `Error processing action for task ${ctx.match?.[1] || 'unknown'}`, err);
    if (ctx.chat) {
      await sendOrEditMessage(
        ctx,
        ctx.chat.id,
        ctx.session.listMessageId,
        `Error executing action: ${(err as Error).message}\nTasks:`,
        getTaskListKeyboard(await getTasks(db), 1)
      );
    } else {
      Logger.error(context, 'Chat context missing, cannot send error message');
    }
    await ctx.answerCbQuery();
  }
}