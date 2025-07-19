import { BotContext } from '../types';

export async function sendOrEditMessage(
  ctx: BotContext,
  chatId: number,
  messageId: number | undefined,
  text: string,
  replyMarkup?: any
) {
  try {
    const message = await ctx.telegram.editMessageText(chatId, messageId, undefined, text, replyMarkup);
    if (typeof message !== 'boolean') ctx.session.listMessageId = message.message_id;
    return message;
  } catch {
    const message = await ctx.reply(text, replyMarkup);
    ctx.session.listMessageId = message.message_id;
    return message;
  }
}