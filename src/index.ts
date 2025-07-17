import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';
import LocalSession from 'telegraf-session-local';
import { setupCommands } from './commands';
import { BotContext } from './types';
import { initDb } from './migrations';
import { scheduleTasks } from './scheduler';
import { saveDb } from './services/database';

dotenv.config();

const token = process.env.BOT_TOKEN;

if (!token) {
  console.error('❌ BOT_TOKEN missing');
  process.exit(1);
}

const bot = new Telegraf<BotContext>(token);

bot.use(new LocalSession().middleware());

const dbPromise = initDb();

try {
  setupCommands(bot, dbPromise);
  bot.telegram.setMyCommands([
    { command: 'start', description: 'Start the bot' },
    { command: 'create', description: 'Create a new task' },
    { command: 'list', description: 'List all tasks' },
  ]);
  dbPromise.then(db => scheduleTasks(bot, db)).catch(err => {
    console.error('❌ Error in scheduleTasks:', err);
  });
} catch (err) {
  console.error('❌ Error in setupCommands:', err);
}

bot.launch({ dropPendingUpdates: true })
  .catch((err) => {
    console.error('❌ Failed to launch bot:', err);
  });

process.once('SIGINT', async () => {
  bot.stop('SIGINT');
  const db = await dbPromise;
  await saveDb(db);
  setTimeout(() => process.exit(0), 1000);
});

process.once('SIGTERM', async () => {
  bot.stop('SIGTERM');
  const db = await dbPromise;
  await saveDb(db);
});