import { BotContext, TaskConfig } from '../../types';
import { Database } from 'sql.js';
import { getTaskById } from '../../services/database';
import { getTaskActionsKeyboard } from '../../keyboard';

export async function handleTask(ctx: BotContext, db: Database) {
  try {
    if (!ctx.match) {
      throw new Error('No match data for task action');
    }
    if (!ctx.chat?.id) {
      throw new Error('Chat ID not found');
    }
    const taskId = parseInt(ctx.match[1]);
    const task = await getTaskById(db, taskId);
    if (task) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        ctx.session.listMessageId,
        undefined,
        `Task: ${task.name}`,
        getTaskActionsKeyboard(taskId)
      ).catch(async () => {
        const message = await ctx.reply(`Task: ${task.name}`, getTaskActionsKeyboard(taskId));
        ctx.session.listMessageId = message.message_id;
      });
    }
    await ctx.answerCbQuery();
  } catch (err) {
    console.error('❌ Error in task action:', err);
    await ctx.reply('Error processing task action.');
  }
}