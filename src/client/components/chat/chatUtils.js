// Small helpers for the chat page (FR-9, FR-10): channel names, times and day separators.
import { useEffect, useState } from 'react';
import { formatDate, formatTime, toDate } from '../../utils/format.js';

export const MAX_MESSAGE_LENGTH = 2000;

// A unique key for a channel, e.g. "1:Group"
export function channelKey(groupId, channel) {
  return `${groupId}:${channel}`;
}

// Short channel name shown under the team name in the list
export function channelTitle(channel) {
  return channel === 'Group' ? 'Group chat' : 'Supervisor & Examiner';
}

// The channel opened by a link like /chat?groupId=1 (without a channel):
// examiners only have the Staff channel, everyone else starts in the group chat
export function defaultChannelFor(role) {
  return role === 'Examiner' ? 'Staff' : 'Group';
}

// true when two dates are on the same calendar day (local time)
export function isSameDay(a, b) {
  const first = toDate(a);
  const second = toDate(b);
  return Boolean(first && second) && first.toDateString() === second.toDateString();
}

// Label of a day separator: "Today", "Yesterday" or "Mon, Sep 22, 2026"
export function dayLabel(value) {
  const date = toDate(value);
  if (!date) return '';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, new Date())) return 'Today';
  if (isSameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

// Compact time for the channel list: "10:02 AM" today, "Yesterday", "Mon" this week, else the date
export function chatListTime(value) {
  const date = toDate(value);
  if (!date) return '';
  const daysAgo = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (isSameDay(date, new Date())) return formatTime(date);
  if (dayLabel(date) === 'Yesterday') return 'Yesterday';
  if (daysAgo < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
  return formatDate(date);
}

// Adds messages to a list without duplicates and keeps it sorted by id (oldest first)
export function mergeMessages(list, newMessages) {
  const byId = new Map(list.map((message) => [message.id, message]));
  newMessages.forEach((message) => byId.set(message.id, message));
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

// true while the screen is at most `maxWidth` pixels wide (phones: the chat shows one panel at a time)
export function useIsNarrow(maxWidth = 768) {
  const queryText = `(max-width: ${maxWidth}px)`;
  const [narrow, setNarrow] = useState(() => window.matchMedia(queryText).matches);

  useEffect(() => {
    const media = window.matchMedia(queryText);
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [queryText]);

  return narrow;
}
