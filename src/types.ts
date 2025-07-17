import { Context } from 'telegraf';

export interface TaskConfig {
  name: string;
  ollama_host: string;
  model: string;
  prompt: string;
  duration: string;
  tags: string;
  url: string;
  chatId: number;
  id?: number;
}

export interface TaskDTO {
  name: string;
  ollama_host: string;
  model: string;
  prompt: string;
  duration: string;
  tags: string;
  url: string;
  chatId: number;
}

export interface SessionData {
  awaitingCreate: boolean;
  awaitingEdit: number | null;
  deleteConfirm: number | null;
  listMessageId?: number;
}

export interface BotContext extends Context {
  session: SessionData;
  match?: RegExpMatchArray;
}