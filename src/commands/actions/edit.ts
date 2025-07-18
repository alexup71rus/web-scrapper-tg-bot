import { BotContext, TaskConfig } from '../../types';
import { Database } from 'sql.js';
import { getTaskById } from '../../services/database';
import { getTaskActionsKeyboard } from '../../keyboard';
import { Logger } from '../../utils/logger';

// Handles cancellation of task editing
export async function handleCancelEdit(ctx: BotContext, db: Database) {
  const context = { module: 'Edit', taskId: ctx.session.awaitingEdit, chatId: ctx.chat?.id?.toString() };
  try {
    const taskId = ctx.session.awaitingEdit;
    if (taskId) {
      const task = await getTaskById(db, taskId);
      if (task) {
        await ctx.telegram.editMessageText(
          ctx.chat?.id,
          ctx.session.listMessageId,
          undefined,
          `Task: ${task.name}`,
          getTaskActionsKeyboard(taskId)
        ).catch(async () => {
          const message = await ctx.reply(`Task: ${task.name}`, getTaskActionsKeyboard(taskId));
          ctx.session.listMessageId = message.message_id;
        });
      }
      ctx.session.awaitingEdit = null;
    }
    await ctx.answerCbQuery();
  } catch (err) {
    Logger.error(context, 'Error in cancel_edit action', err);
    await ctx.reply('Error cancelling edit.');
  }
}