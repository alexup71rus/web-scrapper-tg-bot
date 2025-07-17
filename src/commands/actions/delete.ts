import { BotContext } from '../../types';
import { Database } from 'sql.js';
import { saveDb, getTasks } from '../../services/database';
import { getTaskListKeyboard } from '../../keyboard';

export async function handleConfirmDelete(ctx: BotContext, db: Database) {
  try {
    if (!ctx.match) {
      throw new Error('No match data for delete confirmation');
    }
    const taskId = parseInt(ctx.match[1]);
    if (ctx.session.deleteConfirm === taskId) {
      const stmt = db.prepare('DELETE FROM tasks WHERE id = ?');
      stmt.bind([taskId]);
      stmt.run();
      stmt.free();
      await saveDb(db);
      await ctx.reply('Task deleted successfully.');
      ctx.session.deleteConfirm = null;
      const tasks = await getTasks(db);
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
}

export async function handleCancelDelete(ctx: BotContext) {
  ctx.session.deleteConfirm = null;
  await ctx.reply('Delete cancelled.');
  await ctx.answerCbQuery();
}