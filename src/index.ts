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
const ollamaHost = process.env.OLLAMA_HOST;
const ollamaModel = process.env.OLLAMA_MODEL;

if (!token) {
  console.error('❌ BOT_TOKEN missing');
  process.exit(1);
}
if (!ollamaHost) {
  console.error('❌ OLLAMA_HOST missing');
  process.exit(1);
}
if (!ollamaModel) {
  console.error('❌ OLLAMA_MODEL missing');
  process.exit(1);
}

const bot = new Telegraf<BotContext>(token);

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
    console.log('✅ Bot started successfully');
  } catch (err) {
    console.error('❌ Error starting bot:', err);
    process.exit(1);
  }
}

startBot();

process.once('SIGINT', async () => {
  console.log('Received SIGINT, shutting down...');
  bot.stop('SIGINT');
  const db = await dbPromise;
  await saveDb(db);
  setTimeout(() => process.exit(0), 1000);
});

process.once('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down...');
  bot.stop('SIGTERM');
  const db = await dbPromise;
  await saveDb(db);
  setTimeout(() => process.exit(0), 1000);
});