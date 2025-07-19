import { BotContext } from '../../types';
import { Database } from 'sql.js';
import { saveDb, getTasks } from '../../services/database';
import { getTaskListKeyboard } from '../../keyboard';
import { scheduleTasks } from '../../scheduler';
import { Telegraf } from 'telegraf';
import { Logger } from '../../utils/logger';
import { sendOrEditMessage } from '../../utils/messageUtils';

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
      await sendOrEditMessage(
        ctx,
        ctx.chat.id,
        ctx.callbackQuery?.message?.message_id ?? ctx.session.listMessageId,
        'Task deleted successfully.\nTasks:',
        getTaskListKeyboard(tasks, 1)
      );
    }
    await ctx.answerCbQuery();
  } catch (err) {
    Logger.error(context, 'Error in delete confirmation', err);
    if (ctx.chat) {
      await sendOrEditMessage(
        ctx,
        ctx.chat.id,
        ctx.callbackQuery?.message?.message_id ?? ctx.session.listMessageId,
        `Error deleting task: ${(err as Error).message}\nTasks:`,
        getTaskListKeyboard(await getTasks(db), 1)
      );
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
    await sendOrEditMessage(
      ctx,
      ctx.chat.id,
      ctx.callbackQuery?.message?.message_id ?? ctx.session.listMessageId,
      'Delete cancelled.\nTasks:',
      getTaskListKeyboard(tasks, 1)
    );
    await ctx.answerCbQuery();
  } catch (err) {
    Logger.error(context, 'Error in cancel delete', err);
    if (ctx.chat) {
      await sendOrEditMessage(
        ctx,
        ctx.chat.id,
        ctx.callbackQuery?.message?.message_id ?? ctx.session.listMessageId,
        `Error cancelling delete: ${(err as Error).message}\nTasks:`,
        getTaskListKeyboard(await getTasks(db), 1)
      );
    } else {
      Logger.error(context, 'Chat context missing, cannot send error message');
    }
    await ctx.answerCbQuery();
  }
}