# Web Scraper Telegram Bot
## Overview

A Telegram bot for monitoring website changes (e.g., daily weather updates from Gismeteo) or sending custom notifications. The bot uses Puppeteer to load website content and extract data using CSS selectors. Tasks can be scheduled with cron-like expressions or run manually. A neural network (via Ollama) processes scraped data, or the bot can send simple text notifications for tasks without website scraping.
Features

- Create, edit, delete, and manually run tasks via Telegram commands.
- Schedule tasks with cron expressions or "daily HH:MM" format.
- Extract website content using CSS selectors (optional).
- Process scraped data with a customizable prompt or send as plain text notifications.
- Send conditional alerts based on processed results (optional).
- Persistent task storage with SQLite, preserving tasks across migrations.

## Installation

Install dependencies: pnpm install
Run in development: pnpm dev
Build and run in production: pnpm build and pnpm start

Configuration
Set the following environment variables in a .env file:

```
BOT_TOKEN: Telegram bot token.
CUSTOM_OLLAMA_HOST: Ollama server URL (e.g., http://localhost:11434).
CUSTOM_OLLAMA_MODEL: Ollama model name (e.g., llama3).
```

Usage

1. Start the bot: Use /start to initialize the bot.
2. Create a task: Use /create, then send a task configuration in key-value format.
3. List tasks: Use /list to view all tasks with inline buttons for actions.
4. Edit or delete tasks: Use inline buttons from the task list to edit or delete.
5. Run a task manually: Use the "Run" button from the task list.

## Task Configuration

Tasks are configured by sending a key-value formatted message. Below are examples:

#### Full Task (Website Scraping)
```
Full Task (Website Scraping)
name=WeatherCheck
url=https://www.gismeteo.ru/weather-tula-4392/now/
tags=[data-widget=weather-now]
schedule=daily 10:00
alert_if_true=no
prompt=What's the weather now? Base your answer on this data: {content}
```

#### Conditional Task (e.g., Discounts)
```
name=DiscountCheck
url=https://example.com
tags=.discount
schedule=daily 12:00
alert_if_true=yes
prompt=Are there any discounts? Data: {content}
```

#### Notification Task (No Scraping)
```
name=Reminder
prompt=Buy milk today
```

### Field Descriptions

- `id` (optional for new tasks, required for editing): Unique task identifier (number, auto-assigned on creation).
- `name` (required): Task name (string, at least 1 character).
- `url` (optional): Website URL to scrape (string, must be a valid URL if provided).
- `tags` (optional): CSS selectors for data extraction (string, comma-separated, e.g., .discount,!header).
- `schedule` (optional): Schedule for automatic execution (string, supports "daily HH:MM" or cron expressions, e.g., 0 10 * * * for daily at 10:00). If omitted, task is manual-only.
- `alert_if_true` (optional): Send alerts only if processed result is true (string, "yes" or "no", defaults to "no"). Requires {content} in prompt if "yes".
- `prompt` (required): Instruction for Ollama or text for notifications (string, at least 1 character). Must include {content} if url/tags and alert_if_true="yes" are used.

### Note: 

chatId is automatically set to the Telegram chat ID and not included in the configuration.
Tasks without url or tags operate in notification mode, returning the prompt with a warning: Warning: Standard notification mode active (no website or tags specified).
Tasks without schedule are executed manually via the "Run" button.

### Example Workflow

Send /create.
Send a configuration (e.g., notification: name=Reminder\nprompt=Buy milk today).
Bot confirms: Task "Reminder" added successfully with ID 1 for manual execution. Use /list to view all tasks.
Use /list to view tasks, then click "Run" to execute manually, receiving:Notification: Buy milk today
Warning: Standard notification mode active (no website or tags specified).

For scheduled tasks, the bot runs them automatically and sends results based on alert_if_true.

## Notes

The bot uses a SQLite database (data.db) to store tasks, initialized automatically via migrations.
Migrations preserve existing tasks, updating the schema only when necessary (e.g., making fields optional).
Ollama is used for processing scraped data. Ensure the Ollama server is running and configured in .env.
Logs are generated for debugging, capturing errors in task execution, scheduling, or migrations.
Invalid configurations (e.g., empty name/prompt or invalid url/schedule) return error messages in the Telegram chat.

## Project Structure

```
src/commands/: Telegram command handlers (start, create, list, etc.).
src/services/database.ts: SQLite database operations.
src/migrations/: Database schema migrations.
src/parser.ts: Website scraping with Puppeteer.
src/ollama.ts: Data processing with Ollama.
src/scheduler.ts: Task scheduling with node-cron.
src/utils/: Utilities like logging and task validation.
```
