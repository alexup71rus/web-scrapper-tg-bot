import path from 'path';
import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';
import LocalSession from 'telegraf-session-local';
import { setupCommands } from './commands';
import { BotContext } from './types';
import { initDb } from './migrations';
import { scheduleTasks } from './scheduler';
import { saveDb } from './services/database';
import { Logger } from './utils/logger';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });

// Validate environment variables
const token = process.env.BOT_TOKEN;
const ollamaHost = process.env.CUSTOM_OLLAMA_HOST;
const ollamaModel = process.env.CUSTOM_OLLAMA_MODEL;

if (!token) {
  Logger.error({ module: 'Index' }, 'Missing BOT_TOKEN environment variable');
  process.exit(1);
}
if (!ollamaHost) {
  Logger.error({ module: 'Index' }, 'Missing CUSTOM_OLLAMA_HOST environment variable');
  process.exit(1);
}
if (!ollamaModel) {
  Logger.error({ module: 'Index' }, 'Missing CUSTOM_OLLAMA_MODEL environment variable');
  process.exit(1);
}

const bot = new Telegraf<BotContext>(token);

Logger.initialize(bot);

bot.use(new LocalSession().middleware());

const dbPromise = initDb();

async function startBot() {
  try {
    const db = await dbPromise;
    setupCommands(bot, db);
    bot.telegram.setMyCommands([
      { command: 'start', description: 'Start the bot' },
      { command: 'create', description: 'Create a new task' },
      { command: 'list', description: 'List all tasks' },
    ]);
    await scheduleTasks(bot, db);
    await bot.launch({ dropPendingUpdates: true });
  } catch (err) {
    Logger.error({ module: 'Index' }, 'Failed to start bot', err);
    process.exit(1);
  }
}

async function handleShutdown(signal: string) {
  try {
    const db = await dbPromise;
    await saveDb(db);
    bot.stop(signal);
    setTimeout(() => process.exit(0), 1000);
  } catch (err) {
    Logger.error({ module: 'Index' }, `Error during ${signal} shutdown`, err);
    process.exit(1);
  }
}

startBot();

process.once('SIGINT', () => handleShutdown('SIGINT'));
process.once('SIGTERM', () => handleShutdown('SIGTERM'));