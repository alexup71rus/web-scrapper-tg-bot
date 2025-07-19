import { BotContext } from '../../types';
import { Database } from 'sql.js';
import { getTaskById } from '../../services/database';
import { getTaskActionsKeyboard } from '../../keyboard';
import { Logger } from '../../utils/logger';
import { sendOrEditMessage } from '../../utils/messageUtils';

// Handles task selection action
export async function handleTask(ctx: BotContext, db: Database) {
  const context = { module: 'Task', taskId: ctx.match?.[1], chatId: ctx.chat?.id?.toString() };
  try {
    if (!ctx.match) {
      Logger.error(context, 'No match data for task action');
      throw new Error('No match data for task action');
    }
    if (!ctx.chat?.id) {
      Logger.error(context, 'Chat ID not found');
      throw new Error('Chat ID not found');
    }
    const taskId = parseInt(ctx.match[1]);
    const task = await getTaskById(db, taskId);
    if (task) {
      await sendOrEditMessage(
        ctx,
        ctx.chat.id,
        ctx.session.listMessageId,
        `Task: ${task.name}`,
        getTaskActionsKeyboard(taskId)
      );
    } else {
      await ctx.reply(`Task with ID ${taskId} not found.`);
    }
    await ctx.answerCbQuery();
  } catch (err) {
    Logger.error(context, 'Error in task action', err);
    await ctx.reply('Error processing task action.');
  }
}