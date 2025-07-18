import { BotContext } from '../../types';
import { Database } from 'sql.js';
import { saveDb, getTasks } from '../../services/database';
import { getTaskListKeyboard } from '../../keyboard';
import { scheduleTasks } from '../../scheduler';
import { Telegraf } from 'telegraf';
import { Logger } from '../../utils/logger';

export async function handleConfirmDelete(ctx: BotContext, db: Database, bot: Telegraf<BotContext>) {
  const context = { module: 'Delete', taskId: ctx.match?.[1], chatId: ctx.chat?.id?.toString() };
  try {
    if (!ctx.match || !ctx.chat) {
      Logger.error(context, 'No match data or chat for delete confirmation');
      throw new Error('No match data or chat for delete confirmation');
    }
    const taskId = parseInt(ctx.match[1]);
    if (ctx.session.deleteConfirm === taskId) {
      const stmt = db.prepare('DELETE FROM tasks WHERE id = ?');
      stmt.bind([taskId]);
      stmt.run();
      stmt.free();

      await saveDb(db);
      await scheduleTasks(bot, db);

      ctx.session.deleteConfirm = null;
      const tasks = await getTasks(db);
      const messageId = ctx.callbackQuery?.message?.message_id ?? ctx.session.listMessageId;
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        ctx.callbackQuery?.message?.message_id ?? ctx.session.listMessageId,
        undefined,
        'Task deleted successfully.\nTasks:',
        getTaskListKeyboard(tasks, 1)
      ).catch(async () => {
        const message = await ctx.reply('Task deleted successfully.\nTasks:', getTaskListKeyboard(tasks, 1));
        ctx.session.listMessageId = message.message_id;
      });
    }
    await ctx.answerCbQuery();
  } catch (err) {
    Logger.error(context, 'Error in delete confirmation', err);
    if (ctx.chat) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        ctx.callbackQuery?.message?.message_id ?? ctx.session.listMessageId,
        undefined,
        `Error deleting task: ${(err as Error).message}\nTasks:`,
        getTaskListKeyboard(await getTasks(db), 1)
      ).catch(async () => {
        const message = await ctx.reply(`Error deleting task: ${(err as Error).message}\nTasks:`, getTaskListKeyboard(await getTasks(db), 1));
        ctx.session.listMessageId = message.message_id;
      });
    } else {
      Logger.error(context, 'Chat context missing, cannot send error message');
    }
    await ctx.answerCbQuery();
  }
}

export async function handleCancelDelete(ctx: BotContext, db: Database) {
  const context = { module: 'Delete', chatId: ctx.chat?.id?.toString() };
  try {
    if (!ctx.chat) {
      Logger.error(context, 'Chat context missing');
      throw new Error('Chat context missing');
    }
    ctx.session.deleteConfirm = null;
    const tasks = await getTasks(db);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      ctx.callbackQuery?.message?.message_id ?? ctx.session.listMessageId,
      undefined,
      'Delete cancelled.\nTasks:',
      getTaskListKeyboard(tasks, 1)
    ).catch(async () => {
      const message = await ctx.reply('Delete cancelled.\nTasks:', getTaskListKeyboard(tasks, 1));
      ctx.session.listMessageId = message.message_id;
    });
    await ctx.answerCbQuery();
  } catch (err) {
    Logger.error(context, 'Error in cancel delete', err);
    if (ctx.chat) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        ctx.callbackQuery?.message?.message_id ?? ctx.session.listMessageId,
        undefined,
        `Error cancelling delete: ${(err as Error).message}\nTasks:`,
        getTaskListKeyboard(await getTasks(db), 1)
      ).catch(async () => {
        const message = await ctx.reply(`Error cancelling delete: ${(err as Error).message}\nTasks:`, getTaskListKeyboard(await getTasks(db), 1));
        ctx.session.listMessageId = message.message_id;
      });
    } else {
      Logger.error(context, 'Chat context missing, cannot send error message');
    }
    await ctx.answerCbQuery();
  }
}