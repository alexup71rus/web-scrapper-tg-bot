import { Context } from 'telegraf';

export interface TaskConfig {
  id?: number;
  name: string;
  ollama_host: string;
  model: string;
  prompt: string;
  duration: string;
  tags: string;
  url: string;
}

export interface TaskDTO {
  name: string;
  ollama_host: string;
  model: string;
  prompt: string;
  duration: string;
  tags: string;
  url: string;
}

export interface SessionData {
  awaitingCreate: boolean;
  awaitingEdit: number | null;
  deleteConfirm: number | null;
  listMessageId?: number;
}

export interface BotContext extends Context {
  session: SessionData;
}