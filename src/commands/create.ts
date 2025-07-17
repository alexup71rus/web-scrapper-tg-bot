import { BotContext } from '../types';

export async function handleCreate(ctx: BotContext) {
  ctx.session.awaitingCreate = true;
  ctx.session.awaitingEdit = null;
  ctx.session.deleteConfirm = null;
  await ctx.reply(
    'Send JSON config for the task:\n```json\n' +
    JSON.stringify(
      {
        name: '#NAME#',
        ollama_host: 'http://localhost:11434',
        model: 'llama3',
        prompt: 'Summarize this content: {content}',
        duration: '* * * * *',
        tags: 'body > div,!.promo',
        url: 'https://example.com',
      },
      null,
      2
    ) +
    '\n```',
    { parse_mode: 'Markdown' }
  );
}