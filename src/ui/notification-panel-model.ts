export type NotificationForm = { userId: string; title: string; message: string };

export function buildNotificationToolCall(form: NotificationForm) {
  const userId = form.userId.trim();
  const title = form.title.trim();
  const message = form.message.trim();
  if (!userId) throw new Error('userId is required');
  if (!title) throw new Error('title is required');
  if (!message) throw new Error('message is required');
  return { name: 'mcpapp.notifications.create', arguments: { userId, title, message } } as const;
}
