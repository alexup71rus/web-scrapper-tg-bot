# Web Scraper Telegram Bot

## Overview

A Telegram bot for monitoring website changes, e.g., daily weather updates from Gismeteo. Uses Puppeteer for complete content loading and querySelector for data extraction. Scheduling is configured with cron-like time settings. A neural network formats scraped data into a readable format.

**Example Config**
```json
{
  "name": "weather",
  "ollama_host": "http://192.168.0.126:11434",
  "model": "gemma3:4b",
  "prompt": "What's the weather now? Base your answer on this data: {content}",
  "duration": "0 10 * * *",
  "tags": "[data-widget=weather-now]",
  "url": "https://www.gismeteo.ru/weather-tula-4392/now/"
}
```

## Installation

Install dependencies: `pnpm install`
Run in development: `pnpm dev`
Build and run in production: `pnpm build` and `pnpm start`
