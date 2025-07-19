import { Telegraf } from 'telegraf';
import { BotContext } from '../types';

export interface LogContext {
  module: string;
  taskId?: number | string | null;
  chatId?: string;
  url?: string;
}

export class Logger {
  private static bot: Telegraf<BotContext> | null = null;

  static initialize(botInstance: Telegraf<BotContext>) {
    if (this.bot) {
      console.warn('[Logger] [WARN] Logger already initialized');
      return;
    }
    this.bot = botInstance;
  }

  static error(context: LogContext, message: string, error?: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[${context.module}] [ERROR] ${message}${error ? `: ${errorMessage}` : ''}${this.formatContext(context)}`);
  }

  static warn(context: LogContext, message: string) {
    console.warn(`[${context.module}] [WARN] ${message}${this.formatContext(context)}`);
  }

  static info(context: LogContext, message: string, sendToChat: boolean = false) {
    const logMessage = `[${context.module}] [INFO] ${message}${this.formatContext(context)}`;
    console.log(logMessage);
    if (sendToChat && context.chatId && this.bot) {
      this.bot.telegram.sendMessage(context.chatId, logMessage, { parse_mode: 'Markdown' }).catch(err => {
        console.error(`[${context.module}] [ERROR] Failed to send log to Telegram: ${err.message}${this.formatContext(context)}`);
      });
    }
  }

  private static formatContext(context: LogContext): string {
    const parts: string[] = [];
    if (context.taskId != null) parts.push(`taskId=${context.taskId}`);
    if (context.chatId) parts.push(`chatId=${context.chatId}`);
    if (context.url) parts.push(`url=${context.url}`);
    return parts.length > 0 ? ` [${parts.join(', ')}]` : '';
  }
}