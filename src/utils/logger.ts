import { Telegraf } from 'telegraf';
import { BotContext } from '../types';

export interface LogContext {
  module: string;
  taskId?: number | string | null; // Allow null for taskId
  chatId?: string;
  url?: string;
}

export class Logger {
  private static bot: Telegraf<BotContext> | null = null;

  // Initializes the logger with the bot instance
  static initialize(botInstance: Telegraf<BotContext>) {
    this.bot = botInstance;
  }

  // Logs an error to console
  static error(context: LogContext, message: string, error?: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[${context.module}] [ERROR] ${message}${error ? `: ${errorMessage}` : ''}${this.formatContext(context)}`);
  }

  // Logs a warning to console
  static warn(context: LogContext, message: string) {
    console.warn(`[${context.module}] [WARN] ${message}${this.formatContext(context)}`);
  }

  // Logs info to console and optionally to Telegram
  static info(context: LogContext, message: string, sendToChat: boolean = false) {
    const logMessage = `[${context.module}] [INFO] ${message}${this.formatContext(context)}`;
    console.log(logMessage);
    if (sendToChat && context.chatId && this.bot) {
      this.bot.telegram.sendMessage(context.chatId, logMessage, { parse_mode: 'Markdown' }).catch(err => {
        console.error(`[${context.module}] [ERROR] Failed to send log to Telegram: ${err.message}`);
      });
    }
  }

  // Formats context for log messages
  private static formatContext(context: LogContext): string {
    const parts: string[] = [];
    if (context.taskId != null) parts.push(`taskId=${context.taskId}`); // Check for null explicitly
    if (context.chatId) parts.push(`chatId=${context.chatId}`);
    if (context.url) parts.push(`url=${context.url}`);
    return parts.length > 0 ? ` [${parts.join(', ')}]` : '';
  }
}