// ChatConversation: the right panel of the chat page - one open channel (UC6, UC12).
// It shows the message history with day separators, loads older messages on request,
// receives new messages live ('chat:message'), keeps the view scrolled to the newest message,
// and marks the channel as read while the user is looking at it.
//
// Props:
//   channel           object    the channel from GET /api/chat/channels
//   user              object    the logged-in user
//   onBack            function  back to the channel list (phones)
//   onRead            function  called after the channel was marked as read
//   onMessageSent     function  called with a message the user just sent
//   onMessageDeleted  function  called after the user deleted a message
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Avatar from '../common/Avatar.jsx';
import Icon from '../common/Icon.jsx';
import Loading from '../common/Loading.jsx';
import ErrorMessage from '../common/ErrorMessage.jsx';
import EmptyState from '../common/EmptyState.jsx';
import ChatMessage from './ChatMessage.jsx';
import MessageComposer from './MessageComposer.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useSocketEvent, useSocketStatus } from '../../context/SocketContext.jsx';
import { getMessages, sendMessage, deleteMessage, markChannelRead, CHAT_PAGE_SIZE } from '../../api/chat.js';
import { plural, toDate } from '../../utils/format.js';
import { channelTitle, dayLabel, isSameDay, mergeMessages } from './chatUtils.js';

// Messages from the same person less than 5 minutes apart are shown as one "run"
const RUN_GAP_MS = 5 * 60 * 1000;
// Distance from the bottom (px) that still counts as "at the newest message"
const NEAR_BOTTOM_PX = 120;

export default function ChatConversation({ channel: info, user, onBack, onRead, onMessageSent, onMessageDeleted }) {
  const { groupId, channel } = info;
  const toast = useToast();
  const connected = useSocketStatus();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0); // increases on "Try again"
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [newBelow, setNewBelow] = useState(0); // new messages while the user is scrolled up

  const listRef = useRef(null);
  const scrollPlan = useRef(null); // 'bottom' or { fromBottom } - applied after the next render
  const readTimer = useRef(null);
  const pendingRead = useRef(false);
  const onReadRef = useRef(onRead);
  useEffect(() => {
    onReadRef.current = onRead;
  });

  // ----- Load the newest page when the channel opens -----
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getMessages({ groupId, channel })
      .then((page) => {
        if (cancelled) return;
        scrollPlan.current = 'bottom';
        setMessages(page);
        setHasMore(page.length === CHAT_PAGE_SIZE);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, channel, attempt]);

  // ----- Mark the channel as read (on open, and when new messages arrive while visible) -----
  const markRead = useCallback(() => {
    clearTimeout(readTimer.current);
    pendingRead.current = false;
    markChannelRead({ groupId, channel })
      .then(() => onReadRef.current?.(groupId, channel))
      .catch(() => {}); // not important enough to bother the user
  }, [groupId, channel]);

  useEffect(() => {
    markRead();
    return () => clearTimeout(readTimer.current);
  }, [markRead]);

  // A message that arrived while the browser tab was hidden is marked read when the user comes back
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible' && pendingRead.current) markRead();
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [markRead]);

  // ----- Keep the scroll position right after messages change -----
  useLayoutEffect(() => {
    const list = listRef.current;
    const plan = scrollPlan.current;
    if (!list || !plan) return;
    // 'bottom' = jump to the newest message; otherwise keep the same message in view
    list.scrollTop = plan === 'bottom' ? list.scrollHeight : list.scrollHeight - plan.fromBottom;
    scrollPlan.current = null;
  }, [messages, loading]);

  function isNearBottom() {
    const list = listRef.current;
    return !list || list.scrollHeight - list.scrollTop - list.clientHeight < NEAR_BOTTOM_PX;
  }

  function scrollToBottom() {
    const list = listRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
    setNewBelow(0);
  }

  function handleScroll() {
    if (newBelow > 0 && isNearBottom()) setNewBelow(0);
  }

  // ----- Live updates -----
  useSocketEvent('chat:message', (message) => {
    if (message.groupId !== groupId || message.channel !== channel) return;
    if (messages.some((m) => m.id === message.id)) return; // already shown (e.g. our own message)

    const mine = message.sender.id === user.id;
    if (mine || isNearBottom()) scrollPlan.current = 'bottom';
    else setNewBelow((count) => count + 1);
    setMessages((old) => mergeMessages(old, [message]));

    if (!mine) {
      if (document.visibilityState === 'visible') {
        clearTimeout(readTimer.current);
        readTimer.current = setTimeout(markRead, 800); // wait a moment in case more messages come
      } else {
        pendingRead.current = true;
      }
    }
  });

  useSocketEvent('chat:deleted', (deleted) => {
    if (deleted.groupId === groupId && deleted.channel === channel) {
      setMessages((old) => old.filter((m) => m.id !== deleted.id));
    }
  });

  // After the connection comes back, fetch messages that were sent while we were offline
  useSocketEvent('connect', () => {
    getMessages({ groupId, channel })
      .then((page) => setMessages((old) => mergeMessages(old, page)))
      .catch(() => {});
  });

  // ----- Actions -----
  async function loadOlder() {
    if (messages.length === 0 || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await getMessages({ groupId, channel, before: messages[0].id });
      const list = listRef.current;
      if (list) scrollPlan.current = { fromBottom: list.scrollHeight - list.scrollTop };
      setMessages((old) => mergeMessages(old, page));
      setHasMore(page.length === CHAT_PAGE_SIZE);
    } catch (err) {
      toast.error(err);
    } finally {
      setLoadingOlder(false);
    }
  }

  async function handleSend(text) {
    try {
      const saved = await sendMessage({ groupId, channel, text });
      scrollPlan.current = 'bottom';
      setMessages((old) => mergeMessages(old, [saved]));
      setNewBelow(0);
      onMessageSent?.(saved);
    } catch (err) {
      // UC6 / UC12 exceptional flow: the connection was interrupted
      toast.error(
        err.status === 0 ? 'Your message could not be sent. Please check your connection and try again.' : err
      );
      throw err; // tells the composer to keep the text
    }
  }

  async function handleDelete(message) {
    await deleteMessage(message.id); // ConfirmButton shows the error if this fails
    setMessages((old) => old.filter((m) => m.id !== message.id));
    toast.success('Message deleted');
    onMessageDeleted?.();
  }

  // ----- Render the messages with day separators and "runs" -----
  const rows = [];
  messages.forEach((message, index) => {
    const previous = messages[index - 1];
    const newDay = !previous || !isSameDay(previous.date, message.date);
    if (newDay) {
      rows.push(
        <div key={`day-${message.id}`} className="chat-day" role="separator">
          <span>{dayLabel(message.date)}</span>
        </div>
      );
    }
    const closeInTime = previous && toDate(message.date) - toDate(previous.date) < RUN_GAP_MS;
    const sameRun = !newDay && previous.sender.id === message.sender.id && closeInTime;
    const isOwn = message.sender.id === user.id;
    rows.push(
      <ChatMessage
        key={message.id}
        message={message}
        isOwn={isOwn}
        showHeader={!sameRun}
        onDelete={isOwn ? handleDelete : undefined}
      />
    );
  });

  const members = info.members || [];

  return (
    <div className="chat-conversation">
      <header className="chat-conv-header">
        <button type="button" className="btn btn-ghost btn-icon chat-back" onClick={onBack} aria-label="Back to conversations">
          <Icon name="arrowLeft" />
        </button>
        {channel === 'Group' ? (
          <Avatar name={info.groupName} />
        ) : (
          <span className="chat-staff-avatar" aria-hidden="true">
            <Icon name="shield" size={18} />
          </span>
        )}
        <div className="chat-conv-title">
          <h2>{info.groupName}</h2>
          <p>
            <span>{channelTitle(channel)}</span>
            <span aria-hidden="true">·</span>
            <span>{plural(members.length, 'member')}</span>
            <span className={connected ? 'chat-status chat-status-live' : 'chat-status chat-status-offline'}>
              {connected ? 'Live' : 'Reconnecting...'}
            </span>
          </p>
        </div>
        <div
          className="avatar-stack chat-conv-members"
          role="group"
          aria-label={`Members: ${members.map((m) => m.name).join(', ')}`}
        >
          {members.slice(0, 5).map((member) => (
            <Avatar key={member.id} name={member.name} size="small" />
          ))}
        </div>
      </header>

      <div className="chat-messages" ref={listRef} onScroll={handleScroll} role="log" aria-label="Messages">
        {loading ? (
          <Loading text="Loading messages..." />
        ) : error ? (
          <ErrorMessage error={error} onRetry={() => setAttempt((n) => n + 1)} />
        ) : messages.length === 0 ? (
          <EmptyState
            icon="chat"
            title="No messages yet"
            message={
              channel === 'Group'
                ? 'Say hello to your team and start the conversation.'
                : 'Start the private conversation between the supervisor and the examiner.'
            }
          />
        ) : (
          <>
            {hasMore && (
              <div className="chat-load-older">
                <button type="button" className="btn btn-secondary btn-small" onClick={loadOlder} disabled={loadingOlder}>
                  {loadingOlder ? 'Loading...' : 'Load older messages'}
                </button>
              </div>
            )}
            {rows}
          </>
        )}
      </div>

      {newBelow > 0 && (
        <button type="button" className="chat-new-below" onClick={scrollToBottom}>
          {plural(newBelow, 'new message')} <Icon name="chevronDown" size={16} />
        </button>
      )}

      <MessageComposer
        onSend={handleSend}
        disabled={loading || Boolean(error)}
        placeholder={channel === 'Group' ? 'Type a message to the team...' : 'Type a message...'}
      />
    </div>
  );
}
