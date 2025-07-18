import { TaskConfig, TaskDTO } from '../types';
import * as cron from 'node-cron';

// Parse key-value config
export function parseKeyValueConfig(text: string): Partial<TaskDTO> {
  const config: Partial<TaskDTO> = {};
  const lines = text.trim().split('\n');
  for (const line of lines) {
    const [key, value] = line.split('=').map(s => s.trim());
    if (key && value) {
      if (key === 'id') {
        config.id = Number(value);
      } else if (key === 'alert_if_true') {
        if (value === 'yes' || value === 'no') {
          config.alert_if_true = value;
        }
      } else {
        config[key as keyof Omit<TaskDTO, 'id' | 'alert_if_true'>] = value;
      }
    }
  }
  return config;
}

// Convert daily HH:MM to cron format
export function convertScheduleToCron(schedule: string): string {
  if (schedule.startsWith('daily ')) {
    const time = schedule.replace('daily ', '');
    const [hours, minutes] = time.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      throw new Error('Invalid time format in schedule. Use "daily HH:MM".');
    }
    return `${minutes} ${hours} * * *`;
  }
  return schedule;
}

// Validate URL using URL API
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function isValidTaskConfig(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false;
  const task = row as Record<string, unknown>;
  return (
    typeof task.id === 'number' &&
    typeof task.name === 'string' &&
    typeof task.url === 'string' && isValidUrl(task.url as string) &&
    typeof task.schedule === 'string' && cron.validate(task.schedule as string) &&
    typeof task.prompt === 'string' && (task.prompt as string).includes('{content}') &&
    typeof task.chatId === 'string' &&
    (typeof task.tags === 'string' || task.tags === undefined) &&
    (typeof task.alert_if_true === 'string' ? ['yes', 'no'].includes(task.alert_if_true as string) : true) &&
    (typeof task.raw_schedule === 'string' || task.raw_schedule === undefined)
  );
}

export function isValidTaskDTO(config: any): config is TaskDTO {
  return (
    typeof config.id === 'number' &&
    typeof config.name === 'string' &&
    typeof config.url === 'string' && isValidUrl(config.url) &&
    typeof config.schedule === 'string' && cron.validate(config.schedule) &&
    typeof config.prompt === 'string' && config.prompt.includes('{content}') &&
    typeof config.chatId === 'string' &&
    (typeof config.tags === 'string' || config.tags === undefined) &&
    (typeof config.alert_if_true === 'string' ? ['yes', 'no'].includes(config.alert_if_true) : true) &&
    (typeof config.raw_schedule === 'string' || config.raw_schedule === undefined)
  );
}

export function isValidTaskConfigForEdit(config: any): config is TaskConfig {
  return (
    (typeof config.id === 'number' || config.id === undefined) &&
    (typeof config.name === 'string' || config.name === undefined) &&
    (typeof config.url === 'string' ? isValidUrl(config.url) : config.url === undefined) &&
    (typeof config.schedule === 'string' ? cron.validate(config.schedule) : config.schedule === undefined) &&
    (typeof config.raw_schedule === 'string' || config.raw_schedule === undefined) &&
    (typeof config.prompt === 'string' ? config.prompt.includes('{content}') : config.prompt === undefined) &&
    (typeof config.chatId === 'string' || config.chatId === undefined) &&
    (typeof config.tags === 'string' || config.tags === undefined) &&
    (typeof config.alert_if_true === 'string' ? ['yes', 'no'].includes(config.alert_if_true) : config.alert_if_true === undefined)
  );
}