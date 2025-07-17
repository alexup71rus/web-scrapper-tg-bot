import { Ollama } from 'ollama';

export async function processWithOllama(model: string, prompt: string, content: string, ollama_host = 'http://localhost:11434'): Promise<string> {
  try {
    if (typeof model !== 'string' || !model.trim()) throw new Error('Model must be a non-empty string');
    if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('Prompt must be a non-empty string');
    if (typeof content !== 'string') throw new Error('Content must be a string');
    if (!prompt.includes('{content}')) throw new Error('Prompt must include {content}');
    if (!/https?:\/\/.+/.test(ollama_host)) throw new Error('Invalid ollama_host URL');
    const client = new Ollama({ host: ollama_host });

    try {
      await client.list();
    } catch (err) {
      throw new Error(`Ollama server is not reachable: ${(err as Error).message}`);
    }

    const response = await client.generate({
      model,
      prompt: prompt.replace('{content}', content),
      stream: false
    });

    return response.response;
  } catch (err) {
    console.log(`Ollama error: ${(err as Error).message}`);
    return 'Error processing with Ollama';
  }
}