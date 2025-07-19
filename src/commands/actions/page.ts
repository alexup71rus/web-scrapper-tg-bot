import { BotContext } from '../../types';
import { Database } from 'sql.js';
import { getTasks } from '../../services/database';
import { getTaskListKeyboard } from '../../keyboard';
import { Logger } from '../../utils/logger';

// Handles pagination for task list
export async function handlePage(ctx: BotContext, db: Database) {
  const context = { module: 'Page', chatId: ctx.chat?.id?.toString() };
  try {
    if (!ctx.match) {
      Logger.error(context, 'No match data for page action');
      throw new Error('No match data for page action');
    }
    const page = parseInt(ctx.match[1]);

    if (isNaN(page)) {
      Logger.error(context, 'Invalid page number');
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
    Logger.info(context, 'Error navigating to page', true);
    Logger.error(context, 'Error in page action', err);
    await ctx.reply('Error navigating to page.');
  }
}