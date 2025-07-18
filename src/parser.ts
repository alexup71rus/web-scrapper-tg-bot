import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Logger } from './utils/logger';

puppeteer.use(StealthPlugin());

function validateSelector(sel: string): boolean | string {
  try {
    return document.querySelector(sel) !== null;
  } catch (e) {
    return `Invalid selector error: ${(e as Error).message}`;
  }
}

function extractContent(include: string[], exclude: string[]): string {
  const results: string[] = [];
  for (const inc of include) {
    let elements;
    try {
      elements = document.querySelectorAll(inc);
    } catch (e) {
      return `Error: Invalid selector in content extraction: ${inc}`;
    }
    for (const el of elements) {
      if (!exclude.length || !exclude.some(ex => el.matches(ex))) {
        if (el.textContent) {
          results.push(el.textContent.trim());
        }
      }
    }
  }
  return results.join('\n') || '';
}

export async function parseSite(url: string | undefined, tags: string[] | undefined, retries = 2, retryDelay = 2000, chatId?: string, taskId?: number): Promise<string> {
  const context = { module: 'SiteParser', url, chatId, taskId };
  let browser = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (!url || !/https?:\/\/.+/.test(url)) {
        Logger.error(context, 'Invalid or missing URL');
        return 'Error: Invalid or missing URL';
      }
      if (!tags || !Array.isArray(tags) || tags.length === 0) {
        Logger.error(context, 'Tags must be a non-empty array');
        return 'Error: Tags must be a non-empty array';
      }

      browser = await puppeteer.launch({
        headless: true,
        timeout: 30000,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      );

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

      const include = tags.filter(t => !t.startsWith('!')).map(t => t.trim()).filter(Boolean);
      const exclude = tags.filter(t => t.startsWith('!')).map(t => t.slice(1).trim()).filter(Boolean);

      for (const selector of [...include, ...exclude]) {
        const result = await page.evaluate(validateSelector, selector);
        if (typeof result === 'string' && result.startsWith('Invalid selector error')) {
          return result;
        }
      }

      const content = await page.evaluate(extractContent, include, exclude);
      if (typeof content === 'string' && content.startsWith('Error:')) {
        return content;
      }

      await browser.close();
      browser = null;

      return content || 'No content found';
    } catch (err) {
      Logger.error(context, `Failed to parse site (attempt ${attempt}/${retries}): ${(err as Error).message}`, err);
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        return `Error parsing site: ${(err as Error).message}`;
      }
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (closeErr) {
          Logger.error(context, 'Error closing browser', closeErr);
        }
        browser = null;
      }
    }
  }
  return 'Error parsing site';
}