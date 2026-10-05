// ChatPage: live group chat (FR-9, UC6) and supervisor–examiner chat (FR-10, UC12) - UI fig 48.
// Left: the user's conversations grouped by team (last message + unread badge).
// Right: the open conversation. The open channel is kept in the address, e.g.
// /chat?groupId=1&channel=Group, so notifications and other pages can link straight to it.
// On phones the list and the conversation are shown one at a time.
import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader.jsx';
import Loading from '../components/common/Loading.jsx';
import ErrorMessage from '../components/common/ErrorMessage.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import ChannelList from '../components/chat/ChannelList.jsx';
import ChatConversation from '../components/chat/ChatConversation.jsx';
import { channelKey, defaultChannelFor, useIsNarrow } from '../components/chat/chatUtils.js';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocketEvent } from '../context/SocketContext.jsx';
import { getChannels } from '../api/chat.js';
import '../styles/chat.css';

// Page texts for each role
const INTRO = {
  Student: {
    title: 'Group Chat',
    subtitle: 'Talk with your team and your supervisor in real time.',
    emptyTitle: 'You are not in a group yet',
    emptyMessage: 'Your group chat will appear here once the administrator adds you to a group.',
  },
  Supervisor: {
    title: 'Chat',
    subtitle: "Talk with your groups, and privately with each group's examiner.",
    emptyTitle: 'No conversations yet',
    emptyMessage: 'Your chats will appear here when you are assigned as the supervisor of a group.',
  },
  Examiner: {
    title: 'Chat',
    subtitle: "Discuss your groups' projects privately with their supervisors.",
    emptyTitle: 'No conversations yet',
    emptyMessage: 'Your chats will appear here when you examine a group that has a supervisor.',
  },
};

export default function ChatPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const isNarrow = useIsNarrow();
  const intro = INTRO[user.role] || INTRO.Student;

  const { data: channels, loading, error, reload, setData: setChannels } = useApi(getChannels, []);

  const paramGroupId = Number(searchParams.get('groupId')) || null;
  const paramChannel = searchParams.get('channel');

  // The open channel, worked out from the address.
  // A link without a channel (e.g. /chat?groupId=1) opens the user's default channel of that group.
  const selected = useMemo(() => {
    if (!channels || !paramGroupId) return null;
    const wanted = paramChannel || defaultChannelFor(user.role);
    const exact = channels.find((c) => c.groupId === paramGroupId && c.channel === wanted);
    if (exact || paramChannel) return exact || null;
    return channels.find((c) => c.groupId === paramGroupId) || null;
  }, [channels, paramGroupId, paramChannel, user.role]);

  const selectedKey = selected ? channelKey(selected.groupId, selected.channel) : null;
  const notAvailable = Boolean(channels && paramGroupId && !selected); // e.g. an old link to another group

  const selectChannel = useCallback(
    (c) => setSearchParams({ groupId: String(c.groupId), channel: c.channel }, { replace: true }),
    [setSearchParams]
  );
  const closeChannel = useCallback(() => setSearchParams({}, { replace: true }), [setSearchParams]);

  // Wide screens: open the first conversation automatically. Phones start on the list.
  useEffect(() => {
    if (!isNarrow && channels?.length > 0 && !paramGroupId) selectChannel(channels[0]);
  }, [isNarrow, channels, paramGroupId, selectChannel]);

  // Always show the full address (with the channel) so notification links match the open chat
  useEffect(() => {
    if (selected && paramChannel !== selected.channel) selectChannel(selected);
  }, [selected, paramChannel, selectChannel]);

  // ----- Keep the channel list up to date -----
  function updateChannel(groupId, channel, change) {
    setChannels((list) =>
      list?.map((c) => (c.groupId === groupId && c.channel === channel ? { ...c, ...change(c) } : c))
    );
  }

  function showAsLastMessage(message) {
    return { text: message.text, senderId: message.sender.id, senderName: message.sender.name, date: message.date };
  }

  useSocketEvent('chat:message', (message) => {
    const isOpenAndVisible =
      selectedKey === channelKey(message.groupId, message.channel) && document.visibilityState === 'visible';
    const fromSomeoneElse = message.sender.id !== user.id;
    updateChannel(message.groupId, message.channel, (c) => ({
      lastMessage: showAsLastMessage(message),
      unreadCount: fromSomeoneElse && !isOpenAndVisible ? c.unreadCount + 1 : c.unreadCount,
    }));
  });
  useSocketEvent('chat:deleted', () => reload()); // the preview may have changed
  useSocketEvent('notification:sync', () => reload()); // read in another tab
  useSocketEvent('connect', () => reload());

  const handleRead = useCallback(
    (groupId, channel) =>
      setChannels((list) =>
        list?.map((c) => (c.groupId === groupId && c.channel === channel ? { ...c, unreadCount: 0 } : c))
      ),
    [setChannels]
  );

  function handleMessageSent(message) {
    updateChannel(message.groupId, message.channel, () => ({ lastMessage: showAsLastMessage(message) }));
  }

  // ----- Render -----
  let content;
  if (loading) {
    content = <Loading text="Loading conversations..." />;
  } else if (error) {
    content = <ErrorMessage error={error} onRetry={reload} />;
  } else if (channels.length === 0) {
    content = <EmptyState icon="chat" title={intro.emptyTitle} message={intro.emptyMessage} />;
  } else {
    let main;
    if (selected) {
      main = (
        <ChatConversation
          key={selectedKey}
          channel={selected}
          user={user}
          onBack={closeChannel}
          onRead={handleRead}
          onMessageSent={handleMessageSent}
          onMessageDeleted={reload}
        />
      );
    } else if (notAvailable) {
      main = (
        <EmptyState
          icon="lock"
          title="This conversation is not available"
          message="You are not a member of this chat, or it no longer exists."
          action={
            <button type="button" className="btn btn-secondary" onClick={closeChannel}>
              Back to conversations
            </button>
          }
        />
      );
    } else {
      main = (
        <EmptyState icon="chat" title="Select a conversation" message="Choose a chat from the list to start messaging." />
      );
    }

    content = (
      <div className={`chat-layout ${selected || notAvailable ? 'chat-has-selection' : ''}`.trim()}>
        <aside className="chat-sidebar" aria-label="Conversations">
          <ChannelList channels={channels} selectedKey={selectedKey} onSelect={selectChannel} userId={user.id} />
        </aside>
        <section className="chat-main" aria-label="Conversation">
          {main}
        </section>
      </div>
    );
  }

  return (
    <>
      {/* On phones the open conversation uses the whole screen */}
      {!(isNarrow && selected) && <PageHeader title={intro.title} subtitle={intro.subtitle} />}
      {content}
    </>
  );
}
