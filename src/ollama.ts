import { GenerateResponse, Ollama } from 'ollama';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { Logger } from './utils/logger';

const ResponseSchema = z.object({
  is_show: z.boolean(),
  details: z.string(),
});

export async function processWithOllama(
  prompt: string,
  content: string = '',
  alert_if_true: 'yes' | 'no' | undefined = 'no',
  chatId?: string
): Promise<string> {
  const context = { module: 'Ollama', chatId };
  try {
    if (typeof prompt !== 'string' || !prompt.trim()) {
      Logger.error(context, 'Prompt must be a non-empty string');
      return 'Error: Prompt must be a non-empty string';
    }
    if (typeof content !== 'string') {
      Logger.error(context, 'Content must be a string');
      return 'Error: Content must be a string';
    }
    if (alert_if_true === 'yes' && !prompt.includes('{content}')) {
      Logger.error(context, 'Prompt must include {content} when alert_if_true is "yes"');
      return 'Error: Prompt must include {content} when alert_if_true is "yes"';
    }

    const ollamaHost = process.env.CUSTOM_OLLAMA_HOST || 'http://localhost:11434';
    const model = process.env.CUSTOM_OLLAMA_MODEL || 'llama3';

    if (!/https?:\/\/.*/.test(ollamaHost)) {
      Logger.error(context, 'Invalid ollama_host URL');
      return 'Error: Invalid ollama_host URL';
    }

    const client = new Ollama({ host: ollamaHost });

    try {
      await client.list();
    } catch (err) {
      Logger.info(context, `Ollama server is not reachable: ${(err as Error).message}`, true);
      return `Error: Ollama server is not reachable: ${(err as Error).message}`;
    }

    const finalPrompt = prompt.includes('{content}') ? prompt.replace('{content}', content) : prompt;
    const options: any = {
      model,
      prompt: finalPrompt,
      stream: false,
    };

    if (alert_if_true === 'yes') {
      options.format = zodToJsonSchema(ResponseSchema);
    }

    const response: unknown = await client.generate(options);
    const result = (response as GenerateResponse).response;

    if (alert_if_true === 'yes') {
      try {
        const parsed = ResponseSchema.parse(JSON.parse(result));
        return JSON.stringify(parsed);
      } catch (err) {
        return `Error: Invalid JSON response: ${(err as Error).message}`;
      }
    }

    return result;
  } catch (err) {
    Logger.error(context, `Error processing with Ollama: ${(err as Error).message}`, err);
    return `Error processing with Ollama: ${(err as Error).message}`;
  }
}