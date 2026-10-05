// API functions for the group chat and the supervisor–examiner chat (FR-9, FR-10)
import { api } from './client.js';

// Number of messages loaded per page (must match the backend default)
export const CHAT_PAGE_SIZE = 50;

// [{ groupId, groupName, channel, label, members, lastMessage, unreadCount }]
export const getChannels = () => api.get('/chat/channels');

// { count } - all unread chat messages of the user
export const getChatUnreadCount = () => api.get('/chat/unread-count');

// Messages of one channel, oldest first. Pass `before` (a message id) to load older ones.
export const getMessages = ({ groupId, channel, before, limit = CHAT_PAGE_SIZE }) =>
  api.get('/chat/messages', { groupId, channel, before, limit });

export const sendMessage = ({ groupId, channel, text }) => api.post('/chat/messages', { groupId, channel, text });

export const deleteMessage = (id) => api.del(`/chat/messages/${id}`);

// Marks the message notifications of a channel as read (called when the channel is opened)
export const markChannelRead = ({ groupId, channel }) => api.patch('/chat/read', { groupId, channel });
