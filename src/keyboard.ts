import { Markup } from 'telegraf';
import { TaskConfig } from './types';

// Generates a paginated inline keyboard for task list
export function getTaskListKeyboard(tasks: TaskConfig[], page: number) {
  if (page < 1) {
    page = 1;
  }
  const tasksPerPage = 5;
  const start = (page - 1) * tasksPerPage;
  const end = start + tasksPerPage;
  const paginatedTasks = tasks.slice(start, end);

  const taskButtons = paginatedTasks.map((task) =>
    [Markup.button.callback(task.name, `task_${task.id}`)]
  );

  const navButtons = [];
  if (page > 1) {
    navButtons.push([Markup.button.callback('⬅️ Back', `page_${page - 1}`)]);
  }
  if (end < tasks.length) {
    navButtons.push([Markup.button.callback('Forward ➡️', `page_${page + 1}`)]);
  }

  return Markup.inlineKeyboard([...taskButtons, ...navButtons]);
}

// Generates an inline keyboard for task actions (run, edit, delete, back)
export function getTaskActionsKeyboard(taskId: number) {
  if (!taskId || taskId < 1) {
    return Markup.inlineKeyboard([]);
  }
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Run', `action_${taskId}_run`),
      Markup.button.callback('Edit', `action_${taskId}_edit`),
    ],
    [
      Markup.button.callback('Delete', `action_${taskId}_delete`),
      Markup.button.callback('Back', 'back_to_list'),
    ],
  ]);
}

// Generates an inline keyboard for task editing (cancel option)
export function getEditTaskKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Cancel', 'cancel_edit')],
  ]);
}