// ChannelList: the left panel of the chat page. Lists the user's chat channels grouped by team,
// with the last message, its time and an unread badge (UI fig 48).
//
// Props:
//   channels     array     from GET /api/chat/channels
//   selectedKey  string    channelKey() of the open channel, or null
//   onSelect     function  called with the clicked channel
//   userId       number    the logged-in user's id (to show "You:" before own messages)
import { useState } from 'react';
import Avatar from '../common/Avatar.jsx';
import Icon from '../common/Icon.jsx';
import { channelKey, channelTitle, chatListTime } from './chatUtils.js';

export default function ChannelList({ channels, selectedKey, onSelect, userId }) {
  const [search, setSearch] = useState('');

  const text = search.trim().toLowerCase();
  const visible = text
    ? channels.filter((c) => c.label.toLowerCase().includes(text) || c.lastMessage?.text.toLowerCase().includes(text))
    : channels;

  // Keep the backend order (by team name) and put the channels of one team together
  const teams = [];
  visible.forEach((c) => {
    let team = teams.find((t) => t.groupId === c.groupId);
    if (!team) {
      team = { groupId: c.groupId, groupName: c.groupName, channels: [] };
      teams.push(team);
    }
    team.channels.push(c);
  });

  return (
    <div className="chat-channels">
      <div className="chat-channels-search">
        <label htmlFor="chat-search" className="sr-only">
          Search conversations
        </label>
        <div className="input-with-icon">
          <Icon name="search" size={16} />
          <input
            id="chat-search"
            type="search"
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {teams.length === 0 && <p className="chat-channels-empty">No conversations match your search.</p>}

      {teams.map((team) => (
        <div key={team.groupId} className="chat-team">
          <p className="chat-team-name">{team.groupName}</p>
          <ul className="chat-channel-list">
            {team.channels.map((c) => {
              const key = channelKey(c.groupId, c.channel);
              const selected = key === selectedKey;
              const last = c.lastMessage;
              const sender = last && last.senderId === userId ? 'You' : last?.senderName;
              return (
                <li key={key}>
                  <button
                    type="button"
                    className={`chat-channel ${selected ? 'chat-channel-active' : ''}`.trim()}
                    onClick={() => onSelect(c)}
                    aria-current={selected ? 'true' : undefined}
                  >
                    {c.channel === 'Group' ? (
                      <Avatar name={c.groupName} />
                    ) : (
                      <span className="chat-staff-avatar" aria-hidden="true">
                        <Icon name="shield" size={18} />
                      </span>
                    )}
                    <span className="chat-channel-text">
                      <span className="chat-channel-top">
                        <strong className="truncate">{channelTitle(c.channel)}</strong>
                        {last && <span className="chat-channel-time">{chatListTime(last.date)}</span>}
                      </span>
                      <span className="chat-channel-bottom">
                        <span className="chat-channel-preview truncate">
                          {last ? `${sender}: ${last.text}` : 'No messages yet'}
                        </span>
                        {c.unreadCount > 0 && (
                          <span className="chat-unread" aria-label={`${c.unreadCount} unread`}>
                            {c.unreadCount > 99 ? '99+' : c.unreadCount}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
