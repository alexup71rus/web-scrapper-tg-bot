import { BotContext } from '../types';
import { Database } from 'sql.js';
import { getTasks } from '../services/database';
import { getTaskListKeyboard } from '../keyboard';
import { Logger } from '../utils/logger';

// Handles /list command to display tasks
export async function handleList(ctx: BotContext, db: Database) {
  const context = { module: 'List', chatId: ctx.chat?.id?.toString() };
  try {
    ctx.session.awaitingCreate = false;
    ctx.session.awaitingEdit = null;
    ctx.session.deleteConfirm = null;
    const tasks = await getTasks(db);
    const message = await ctx.reply('Tasks:', getTaskListKeyboard(tasks, 1));
    ctx.session.listMessageId = message.message_id;
  } catch (err) {
    Logger.error(context, 'Error in /list command', err);
    await ctx.reply('Error displaying tasks.');
  }
}