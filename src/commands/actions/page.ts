import { BotContext } from '../../types';
import { Database } from 'sql.js';
import { getTasks } from '../../services/database';
import { getTaskListKeyboard } from '../../keyboard';

export async function handlePage(ctx: BotContext, db: Database) {
  try {
    if (!ctx.match) {
      throw new Error('No match data for page action');
    }
    const page = parseInt(ctx.match[1]);

    if (isNaN(page)) {
      throw new Error('Invalid page number');
    }

    const tasks = await getTasks(db);
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
}