import { Markup } from 'telegraf';
import { TaskConfig } from './types';

export function getTaskListKeyboard(tasks: TaskConfig[], page: number) {
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

export function getTaskActionsKeyboard(taskId: number) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Run', `action_${taskId}_run`),
      Markup.button.callback('Edit', `action_${taskId}_edit`)
    ],
    [
      Markup.button.callback('Delete', `action_${taskId}_delete`),
      Markup.button.callback('Back', 'back_to_list')
    ]
  ]);
}

export function getEditTaskKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Cancel', 'cancel_edit')]
  ]);
}