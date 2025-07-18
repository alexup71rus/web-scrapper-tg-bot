import { GenerateResponse, Ollama } from 'ollama';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const ResponseSchema = z.object({
  is_show: z.boolean(),
  details: z.string(),
});

export async function processWithOllama(prompt: string, content: string, alert_if_true: 'yes' | 'no' = 'no'): Promise<string> {
  try {
    if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('Prompt must be a non-empty string');
    if (typeof content !== 'string') throw new Error('Content must be a string');
    if (!prompt.includes('{content}')) throw new Error('Prompt must include {content}');

    const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
    const model = process.env.OLLAMA_MODEL || 'llama3';

    if (!/https?:\/\/.+/.test(ollamaHost)) throw new Error('Invalid ollama_host URL');

    const client = new Ollama({ host: ollamaHost });

    try {
      await client.list();
    } catch (err) {
      throw new Error(`Ollama server is not reachable: ${(err as Error).message}`);
    }

    const finalPrompt = prompt.replace('{content}', content);
    const options: any = {
      model,
      prompt: finalPrompt,
      stream: false,
    };

    // Enforce JSON schema for structured output when alert_if_true is 'yes'
    if (alert_if_true === 'yes') {
      options.format = zodToJsonSchema(ResponseSchema);
    }

    const response: unknown = await client.generate(options);

    const result = (response as GenerateResponse).response;

    if (alert_if_true === 'yes') {
      try {
        const parsed = ResponseSchema.parse(JSON.parse(result));
        return JSON.stringify(parsed); // Return JSON string
      } catch (err) {
        throw new Error(`Invalid JSON response: ${(err as Error).message}`);
      }
    }

    return result;
  } catch (err) {
    console.log(`Ollama error: ${(err as Error).message}`);
    return `Error processing with Ollama: ${(err as Error).message}`;
  }
}