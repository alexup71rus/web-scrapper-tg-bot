import { Context } from 'telegraf';

export interface TaskConfig {
  id?: number;
  name: string;
  url: string;
  tags?: string;
  schedule: string;
  raw_schedule?: string;
  alert_if_true?: 'yes' | 'no';
  prompt: string;
}

export interface TaskDTO {
  id: number;
  name: string;
  url: string;
  tags?: string;
  schedule: string;
  raw_schedule?: string;
  alert_if_true?: 'yes' | 'no';
  prompt: string;
  chatId: string;
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