# Web Scraper Telegram Bot

## Overview

A Telegram bot for monitoring website changes, such as daily weather updates from Gismeteo. The bot uses Puppeteer to load full website content and querySelector to extract data based on specified tags. Tasks are scheduled using cron-like expressions or a "daily HH:MM" format. A neural network (via Ollama) processes scraped data into a readable format.

### Features
- Create, edit, delete, and manually run tasks via Telegram commands.
- Schedule tasks with cron expressions or daily time settings.
- Extract content from websites using CSS selectors (tags).
- Process scraped data with a customizable prompt for readable output.
- Send alerts based on conditions defined in the task configuration.

## Installation

1. Install dependencies: `pnpm install`
2. Run in development: `pnpm dev`
3. Build and run in production: `pnpm build` and `pnpm start`

## Usage

1. **Start the bot**: Use the `/start` command to initialize the bot.
2. **Create a task**: Use the `/create` command, then send a task configuration in key-value format.
3. **List tasks**: Use the `/list` command to view all tasks.
4. **Edit or delete tasks**: Use inline buttons from the task list to edit or delete a task.
5. **Run a task manually**: Use the "Run" button from the task list.

### Task Configuration

Tasks are configured by sending a key-value formatted message to the bot. Below is an example configuration for a task that scrapes weather data from Gismeteo:

```
id=1
name=weather
url=https://www.gismeteo.ru/weather-tula-4392/now/
tags=[data-widget=weather-now]
schedule=daily 10:00
alert_if_true=no
prompt=What's the weather now? Base your answer on this data: {content}
```


#### Field Descriptions
- `id` (optional for new tasks, required for editing): Unique task identifier (number). Automatically assigned when creating a new task.
- `name`: Task name (string, required).
- `url`: Website URL to scrape (string, required, must be a valid URL).
- `tags`: CSS selectors for data extraction (string, optional, defaults to "body").
- `schedule`: Schedule for task execution (string, required, supports "daily HH:MM" or cron expressions, e.g., `0 10 * * *` for daily at 10:00).
- `alert_if_true`: Whether to send alerts only when the processed result is true (string, optional, "yes" or "no", defaults to "no").
- `prompt`: Instruction for the neural network to process scraped data (string, required, must include `{content}`).

**Note**: The `chatId` is automatically set to the Telegram chat ID where the task is created and is not included in the configuration.

## Example Workflow
1. Send `/create` to the bot.
2. Send the configuration above.
3. The bot will confirm the task creation and schedule it.
4. Use `/list` to view tasks, then use inline buttons to edit, delete, or run the task manually.

## Notes
- Ensure the database (`data.db`) is initialized with the `tasks` table before running the bot.
- The bot connects to an Ollama instance for processing scraped data. Configure the Ollama host and model in the bot's environment or configuration files (not part of task configuration).
- Logs are generated for debugging, including errors during task execution or scheduling.