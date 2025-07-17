import { TaskConfig, TaskDTO } from '../types';

export function isValidTaskConfig(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false;
  const task = row as Record<string, unknown>;
  return (
    typeof task.id === 'number' &&
    typeof task.name === 'string' &&
    typeof task.ollama_host === 'string' &&
    typeof task.model === 'string' &&
    typeof task.prompt === 'string' &&
    typeof task.duration === 'string' &&
    typeof task.tags === 'string' &&
    typeof task.url === 'string' &&
    typeof task.chatId === 'number'
  );
}

export function isValidTaskDTO(config: any): config is TaskDTO {
  return (
    typeof config.name === 'string' &&
    typeof config.ollama_host === 'string' &&
    typeof config.model === 'string' &&
    typeof config.prompt === 'string' &&
    typeof config.duration === 'string' &&
    typeof config.tags === 'string' &&
    typeof config.url === 'string' &&
    typeof config.chatId === 'number'
  );
}

export function isValidTaskConfigForEdit(config: any): config is TaskConfig {
  return (
    (typeof config.id === 'number' || config.id === undefined) &&
    typeof config.name === 'string' &&
    typeof config.ollama_host === 'string' &&
    typeof config.model === 'string' &&
    typeof config.prompt === 'string' &&
    typeof config.duration === 'string' &&
    typeof config.tags === 'string' &&
    typeof config.url === 'string' &&
    typeof config.chatId === 'number'
  );
}