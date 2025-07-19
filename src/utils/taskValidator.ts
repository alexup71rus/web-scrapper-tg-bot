import { TaskDTO, TaskConfig } from '../types';
import * as cron from 'node-cron';
import { Logger } from './logger';

export class TaskValidator {
  static parseKeyValueConfig(text: string, chatId?: string): Partial<TaskConfig> {
    const context = { module: 'TaskValidator', chatId };
    try {
      const config: Partial<TaskConfig> = {};
      const lines = text.trim().split('\n').map(line => line.trim()).filter(line => line);
      if (lines.length === 0) {
        Logger.warn(context, 'No valid lines in configuration');
        return {};
      }
      for (const line of lines) {
        const firstEqualIndex = line.indexOf('=');
        if (firstEqualIndex === -1 || firstEqualIndex === 0 || firstEqualIndex === line.length - 1) {
          Logger.warn(context, `Invalid key-value format: ${line}`);
          continue;
        }
        const key = line.slice(0, firstEqualIndex).trim();
        const value = line.slice(firstEqualIndex + 1).trim();
        if (key && value) {
          if (key === 'id') {
            config.id = Number(value);
          } else if (key === 'alert_if_true' && ['yes', 'no'].includes(value)) {
            config.alert_if_true = value as 'yes' | 'no';
          } else if (key !== 'chatId') {
            config[key as keyof Omit<TaskConfig, 'id' | 'alert_if_true'>] = value;
          }
        } else {
          Logger.warn(context, `Empty key or value in line: ${line}`);
        }
      }
      return config;
    } catch (err) {
      Logger.error(context, 'Error parsing key-value configuration', err);
      return {};
    }
  }

  static convertScheduleToCron(schedule: string): string {
    const context = { module: 'TaskValidator' };
    try {
      if (schedule.startsWith('daily ')) {
        const time = schedule.replace('daily ', '').trim();
        const [hours, minutes] = time.split(':').map(Number);
        if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
          throw new Error('Invalid time format in schedule. Use "daily HH:MM".');
        }
        return `${minutes} ${hours} * * *`;
      }
      return schedule;
    } catch (err) {
      Logger.error(context, 'Error converting schedule to cron', err);
      throw new Error(`Failed to convert schedule: ${(err as Error).message}`);
    }
  }

  static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  static isValidTaskConfig(row: unknown): boolean {
    const context = { module: 'TaskValidator', chatId: (row as any)?.chatId };
    try {
      if (!row || typeof row !== 'object') {
        Logger.error(context, 'Invalid row: not an object or null');
        return false;
      }
      const task = row as Record<string, unknown>;
      task.id = typeof task.id === 'string' ? Number(task.id) : task.id;
      const checks = [
        { condition: typeof task.id !== 'number' || isNaN(task.id), message: `Invalid id: ${task.id}` },
        { condition: typeof task.name !== 'string' || task.name.trim() === '', message: `Invalid name: ${task.name}` },
        { condition: typeof task.url !== 'string' || !this.isValidUrl(task.url as string), message: `Invalid url: ${task.url}` },
        { condition: typeof task.schedule !== 'string' || !cron.validate(task.schedule as string), message: `Invalid schedule: ${task.schedule}` },
        { condition: typeof task.prompt !== 'string' || !(task.prompt as string).includes('{content}'), message: `Invalid prompt: ${task.prompt}` },
        { condition: typeof task.chatId !== 'string' || task.chatId.trim() === '', message: `Invalid chatId: ${task.chatId}` },
        { condition: !(typeof task.tags === 'string' || task.tags === undefined || task.tags === null), message: `Invalid tags: ${task.tags}` },
        { condition: typeof task.alert_if_true === 'string' && !['yes', 'no', ''].includes(task.alert_if_true as string), message: `Invalid alert_if_true: ${task.alert_if_true}` },
        { condition: !(typeof task.raw_schedule === 'string' || task.raw_schedule === undefined || task.raw_schedule === null), message: `Invalid raw_schedule: ${task.raw_schedule}` },
      ];
      for (const check of checks) {
        if (check.condition) {
          Logger.error(context, check.message);
          return false;
        }
      }
      return true;
    } catch (err) {
      Logger.error(context, 'Error validating task configuration', err);
      return false;
    }
  }

  static isValidTaskDTO(config: any): boolean {
    const context = { module: 'TaskValidator', chatId: config?.chatId };
    try {
      config.id = typeof config.id === 'string' ? Number(config.id) : config.id;
      const checks = [
        { condition: typeof config.id !== 'number' || isNaN(config.id), message: `Invalid id: ${config.id}` },
        { condition: typeof config.name !== 'string' || config.name.trim() === '', message: `Invalid name: ${config.name}` },
        { condition: typeof config.url !== 'string' || !this.isValidUrl(config.url), message: `Invalid url: ${config.url}` },
        { condition: typeof config.schedule !== 'string' || !cron.validate(config.schedule), message: `Invalid schedule: ${config.schedule}` },
        { condition: typeof config.prompt !== 'string' || !config.prompt.includes('{content}'), message: `Invalid prompt: ${config.prompt}` },
        { condition: typeof config.chatId !== 'string' || config.chatId.trim() === '', message: `Invalid chatId: ${config.chatId}` },
        { condition: !(typeof config.tags === 'string' || config.tags === undefined || config.tags === null), message: `Invalid tags: ${config.tags}` },
        { condition: typeof config.alert_if_true === 'string' && !['yes', 'no', ''].includes(config.alert_if_true), message: `Invalid alert_if_true: ${config.alert_if_true}` },
        { condition: !(typeof config.raw_schedule === 'string' || config.raw_schedule === undefined || config.raw_schedule === null), message: `Invalid raw_schedule: ${config.raw_schedule}` },
      ];
      for (const check of checks) {
        if (check.condition) {
          Logger.error(context, check.message);
          return false;
        }
      }
      return true;
    } catch (err) {
      Logger.error(context, 'Error validating TaskDTO', err);
      return false;
    }
  }

  static isValidTaskConfigForEdit(config: any): boolean {
    const context = { module: 'TaskValidator', chatId: config?.chatId };
    try {
      return (
        (typeof config.id === 'number' || typeof config.id === 'string' || config.id === undefined) &&
        (typeof config.name === 'string' || config.name === undefined) &&
        (typeof config.url === 'string' ? this.isValidUrl(config.url) : config.url === undefined) &&
        (typeof config.schedule === 'string' ? cron.validate(config.schedule) : config.schedule === undefined) &&
        (typeof config.raw_schedule === 'string' || config.raw_schedule === undefined || config.raw_schedule === null) &&
        (typeof config.prompt === 'string' ? config.prompt.includes('{content}') : config.prompt === undefined) &&
        (typeof config.tags === 'string' || config.tags === undefined || config.tags === null) &&
        (typeof config.alert_if_true === 'string' ? ['yes', 'no'].includes(config.alert_if_true) : config.alert_if_true === undefined)
      );
    } catch (err) {
      Logger.error(context, 'Error validating TaskConfig for edit', err);
      return false;
    }
  }
}