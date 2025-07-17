import { BotContext } from '../../types';
import { Database } from 'sql.js';
import { getTasks } from '../../services/database';
import { getTaskListKeyboard } from '../../keyboard';

export async function handleBackToList(ctx: BotContext, db: Database) {
  try {
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
    await ctx.answerCbQuery();
  } catch (err) {
    console.error('❌ Error in back_to_list action:', err);
    await ctx.reply('Error returning to task list.');
  }
}