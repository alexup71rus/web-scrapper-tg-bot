import { BotContext } from '../../types';
import { Database } from 'sql.js';
import { getTasks } from '../../services/database';
import { getTaskListKeyboard } from '../../keyboard';
import { Logger } from '../../utils/logger';
import { sendOrEditMessage } from '../../utils/messageUtils';

// Handles back_to_list action to display task list
export async function handleBackToList(ctx: BotContext, db: Database) {
  const context = { module: 'BackToList', chatId: ctx.chat?.id?.toString() };
  try {
    if (!ctx.chat?.id) {
      Logger.error(context, 'Chat ID not found');
      throw new Error('Chat ID not found');
    }
    const tasks = await getTasks(db);
    await sendOrEditMessage(
      ctx,
      ctx.chat.id,
      ctx.session.listMessageId,
      'Tasks:',
      getTaskListKeyboard(tasks, 1)
    );
    await ctx.answerCbQuery();
  } catch (err) {
    Logger.error(context, 'Error in back_to_list action', err);
    await ctx.reply('Error returning to task list.');
  }
}