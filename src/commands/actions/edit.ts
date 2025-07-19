import { BotContext } from '../../types';
import { Database } from 'sql.js';
import { getTaskById } from '../../services/database';
import { getTaskActionsKeyboard } from '../../keyboard';
import { Logger } from '../../utils/logger';
import { sendOrEditMessage } from '../../utils/messageUtils';

// Handles cancellation of task editing
export async function handleCancelEdit(ctx: BotContext, db: Database) {
  const context = { module: 'Edit', taskId: ctx.session.awaitingEdit, chatId: ctx.chat?.id?.toString() };
  try {
    if (!ctx.chat?.id) {
      Logger.error(context, 'Chat ID not found');
      throw new Error('Chat ID not found');
    }
    const taskId = ctx.session.awaitingEdit;
    if (taskId) {
      const task = await getTaskById(db, taskId);
      if (task) {
        await sendOrEditMessage(
          ctx,
          ctx.chat.id,
          ctx.session.listMessageId,
          `Task: ${task.name}`,
          getTaskActionsKeyboard(taskId)
        );
      }
      ctx.session.awaitingEdit = null;
    }
    await ctx.answerCbQuery();
  } catch (err) {
    Logger.error(context, 'Error in cancel_edit action', err);
    await ctx.reply('Error cancelling edit.');
  }
}