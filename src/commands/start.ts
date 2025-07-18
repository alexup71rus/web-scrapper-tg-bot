import { BotContext } from '../types';

// Handles /start command to initialize bot interaction
export async function handleStart(ctx: BotContext) {
  ctx.session.awaitingCreate = false;
  ctx.session.awaitingEdit = null;
  ctx.session.deleteConfirm = null;
  await ctx.reply('Welcome to Web Scraper Bot! Use /create to add a task or /list to view tasks.');
}