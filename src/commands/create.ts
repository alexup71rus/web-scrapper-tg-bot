import { BotContext } from '../types';

export async function handleCreate(ctx: BotContext) {
  ctx.session.awaitingCreate = true;
  ctx.session.awaitingEdit = null;
  ctx.session.deleteConfirm = null;
  await ctx.reply(
    'Send key-value config for the task (omit "id" for creation, include "id" for editing):\n```\n' +
    'name=MyTask\n' +
    'url=https://example.com\n' +
    'tags=.discount\n' +
    'schedule=daily 10:00\n' +
    'alert_if_true=yes\n' +
    'prompt=Are there any discounts? Data: {content}\n' +
    '```',
    { parse_mode: 'Markdown' }
  );
}