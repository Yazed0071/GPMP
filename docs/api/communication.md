# Communication & Resources

This part of GPMP covers how people talk to each other and where students find help:

| Feature | Requirements | Backend | Frontend page |
| --- | --- | --- | --- |
| Group chat (students + supervisor) | FR-9, UC6 | `/api/chat` | `/chat` (ChatPage) |
| Supervisor–examiner chat | FR-10, UC12 | `/api/chat` | `/chat` (ChatPage) |
| Announcements (+ email) | FR-12, UC7, UC8 | `/api/announcements` | `/announcements` (AnnouncementsPage) |
| Notifications | FR-20 | `/api/notifications` | navbar bell + `/notifications` (NotificationsPage) |
| Learning resources | FR-17 | `/api/resources` | `/resources` (ResourcesPage) |

All endpoints need a login token (`Authorization: Bearer <token>`). Errors use the normal format
`{ "error": { "message": "...", "details"?: ... } }`.

---

## 1. Files

**Backend**

```
src/server/routes/chat.routes.js            src/server/controllers/chat.controller.js
src/server/routes/announcements.routes.js   src/server/controllers/announcements.controller.js
src/server/routes/notifications.routes.js   src/server/controllers/notifications.controller.js
src/server/routes/resources.routes.js       src/server/controllers/resources.controller.js
```

`notifications.controller.js` also exports `countUnread(userId)` (used by the dashboard) and
`emitNotificationSync(userId)` (used by the chat controller).

**Frontend**

```
src/client/api/chat.js, announcements.js, notifications.js, resources.js   API functions
src/client/pages/ChatPage.jsx, AnnouncementsPage.jsx, NotificationsPage.jsx, ResourcesPage.jsx
src/client/components/chat/             ChannelList, ChatConversation, ChatMessage, MessageComposer, chatUtils.js
src/client/components/announcements/    AnnouncementCard, AnnouncementFormModal, audience.js
src/client/components/notifications/    NotificationBell (in the Navbar), NotificationItem, notificationUtils.js
src/client/components/resources/        ResourceCard, ResourceFormModal, categories.js
src/client/styles/chat.css, announcements.css, notifications.css, resources.css   (prefixes chat- ann- notif- res-)
```

---

## 2. Chat — `/api/chat`

### Channels

A **channel** is one group plus one type (`chat_message.MsgType`):

| Channel | Members | Socket.IO room |
| --- | --- | --- |
| `Group` | the group's students + its supervisor | `group:<groupId>` |
| `Staff` | the group's supervisor + its examiner | `staff:<groupId>` |

- Students have the `Group` channel of their own group.
- Supervisors have the `Group` channel of every group they supervise, and its `Staff` channel when the
  group has an examiner.
- Examiners have the `Staff` channel of every group they examine that has a supervisor.
- Administrators have no chat channels (they get an empty list and 403 on messages).

A user who is removed from a group loses access immediately (UC6 exceptional flow): every request
checks membership again, and the answer is 403 `"You do not have access to this chat."`.

### Endpoints

| Method & path | Who | What it does |
| --- | --- | --- |
| `GET /api/chat/channels` | everyone | the user's channels |
| `GET /api/chat/unread-count` | everyone | `{ count }` of unread chat messages (all channels) |
| `GET /api/chat/messages?groupId=&channel=&before=&limit=` | channel members | one page of messages, oldest first |
| `POST /api/chat/messages` | channel members | send a message |
| `DELETE /api/chat/messages/:id` | the sender | delete your own message (UC6 alternative flow) |
| `PATCH /api/chat/read` | channel members | mark the channel's message notifications as read |

**GET /api/chat/channels**

```json
[{
  "groupId": 1, "groupName": "Team Alpha", "channel": "Group",
  "label": "Team Alpha — Group chat",
  "members": [{ "id": 2, "name": "Dr. Ahmed Alotaibi", "role": "Supervisor" }, { "id": 8, "name": "Abdullah Alrashid", "role": "Student" }],
  "lastMessage": { "text": "Yes, a short live demo...", "senderId": 2, "senderName": "Dr. Ahmed Alotaibi", "date": "2026-09-28T14:08:00.000Z" },
  "unreadCount": 3
}]
```

Ordered by group name; a group's `Group` channel comes before its `Staff` channel. The Staff label is
`"Team Alpha — Supervisor & Examiner"`. `lastMessage` is `null` when nobody has written yet.

**GET /api/chat/messages?groupId=1&channel=Group** → `[{ id, groupId, channel, text, date, sender: { id, name, role } }]`

- Returns the newest `limit` messages (default 50, max 100) in **ascending** order.
- To load older messages send `before=<id of the oldest message you have>`. Fewer than `limit`
  results means there is nothing older.
- 400 bad/missing `groupId` or `channel` (`"Group is required"`, `"Channel must be one of: Group, Staff"`),
  404 `"Group not found"`, 403 `"You do not have access to this chat."`.
- A deleted user shows as `sender: { id: null, name: "Former user", role: null }`.

**POST /api/chat/messages** `{ "groupId": 1, "channel": "Group", "text": "Hello team" }` → 201 the message

1. The text is trimmed; empty → 400 `"Message cannot be empty."`; more than 2000 characters → 400.
2. The message is saved (`Staff` messages also store `ReceiverUserID` = the other person).
3. The sender's own unread message notifications for this channel are marked read.
4. The other members are notified (type `Message`, link `/chat?groupId=1&channel=Group`) — see
   *collapsing* below.
5. Socket event `chat:message` (the message object) is sent to the channel's room.

**PATCH /api/chat/read** `{ groupId, channel }` → `{ message, updated }`. The chat page calls it when a
channel is opened and when new messages arrive while it is open.

**DELETE /api/chat/messages/:id** → `{ message: "Message deleted" }`. Only the sender (and only while
still a member). Sends socket event `chat:deleted` `{ id, groupId, channel }` to the room.
403 `"You can only delete your own messages."`, 404 `"Message not found"`.

### Message notifications are "collapsed"

A busy chat must not flood the notification list. For each recipient:

- If they have **no unread** `Message` notification with the channel link → a new one is created with
  `notify()`: title `"New message in Team Alpha — Group chat"`, message `"<sender>: <text>"`.
- If they **already have an unread one** → that row is updated instead: title
  `"3 new messages in Team Alpha — Group chat"`, the newest text, and `CreatedAt = now` (so it moves to the
  top). The update is sent live as `notification:updated`.

The number in the title is what `unreadCount` (per channel) and `/api/chat/unread-count` add up.
Opening the channel (PATCH `/read`) marks it read, so the next message starts a new notification.

Links without a channel (`/chat?groupId=1`) open the user's *default*
channel of that group — `Staff` for examiners, `Group` for everyone else — and are counted/marked read
for that channel.

---

## 3. Announcements — `/api/announcements`

| Method & path | Who | What it does |
| --- | --- | --- |
| `GET /api/announcements?limit=` | everyone | visible announcements, newest first (default limit 200) |
| `POST /api/announcements` | Supervisor, Administrator | publish (+ notification and email to the audience) |
| `PUT /api/announcements/:id` | the publisher or an Administrator | edit (sets `AnnouncementEditDate`) |
| `DELETE /api/announcements/:id` | the publisher or an Administrator | delete |

**Visibility rule** (the dashboard uses the same rule): an announcement is visible when
`(TargetRole = 'All' OR TargetRole = the user's role OR the user is an Administrator)`
`AND (GroupID IS NULL OR the user can access that group)`. The publisher always sees their own.

Example: supervisor1's announcement to Team Alpha is visible to Alpha's students and examiner, to
supervisor1 and to administrators — **not** to student4 (Team Beta).

**Response item**

```json
{
  "id": 4, "title": "Mid-term Presentation Preparation", "content": "...",
  "date": "2026-09-27T12:00:00.000Z", "editedAt": null,
  "targetRole": "All", "group": { "id": 1, "name": "Team Alpha" },
  "publisher": { "id": 2, "name": "Dr. Ahmed Alotaibi", "role": "Supervisor" },
  "canEdit": false
}
```

**POST / PUT body**: `{ title, content, targetRole?, groupId? }`

- `title` and `content` are required: 400 `"Title is required"`, `"Content is required"` (UC7
  exceptional flow). Title ≤ 200 characters, content ≤ 10,000.
- `targetRole`: `All` (default), `Student`, `Supervisor` or `Examiner`.
- `groupId`: `null` = everyone (administrators only). **Supervisors must choose one of their own
  groups**: missing → 400 `"Please choose one of your groups"`, another group → 403
  `"You can only post announcements to the groups you supervise."`.
- On PUT, fields that are not sent keep their old value.
- Who is notified (type `Announcement`, link `/announcements`, **email: true** — UC8): with a group,
  the group's students / supervisor / examiner that match `targetRole`; without a group, every active
  user with that role (or everyone). The publisher is never notified. Email problems are only logged
  (UC7 exceptional flow); without SMTP settings the emails are printed as `[email preview]`.

---

## 4. Notifications — `/api/notifications`

Users only ever see and change **their own** notifications (another user's id → 404).

| Method & path | What it does |
| --- | --- |
| `GET /api/notifications?unread=true&limit=50` | newest first; `limit` 1–200 (default 50) |
| `GET /api/notifications/unread-count` | `{ count }` for the bell |
| `PATCH /api/notifications/:id/read` | → the notification with `isRead: true` |
| `PATCH /api/notifications/read-all` | → `{ message, updated }` |
| `DELETE /api/notifications/:id` | → `{ message }` |

Item: `{ id, type, title, message, link, isRead, createdAt }`. Types: Announcement, Deadline, Meeting,
Message, Feedback, Task, Proposal, System.

---

## 5. Resources — `/api/resources`

| Method & path | Who | What it does |
| --- | --- | --- |
| `GET /api/resources?category=&search=` | everyone | newest first; `search` looks in title + description |
| `POST /api/resources` | Supervisor, Administrator | add |
| `PUT /api/resources/:id` | Administrator (any), Supervisor (own only) | edit |
| `DELETE /api/resources/:id` | Administrator (any), Supervisor (own only) | delete |

Body: `{ title, description?, url, category }`. Item: `{ id, title, description, url, category, createdAt, createdBy: { id, name } | null, canEdit }`.

- Required: 400 `"Title is required"`, `"Link is required"`, `"Category is required"`.
- `url` must start with `http://` or `https://` → 400 `"The link must start with http:// or https://"`
  (so a link can never run a script), and must be a valid address → 400 `"Please enter a valid link"`.
- `category`: `Tutorial | Tool | Framework | Library | Guide`.
- A supervisor changing someone else's resource → 403 `"You can only change the resources you added."`.

---

## 6. Live updates (Socket.IO events)

| Event | Sent to | Data | Used by |
| --- | --- | --- | --- |
| `chat:message` | `group:<gid>` / `staff:<gid>` | the message | ChatPage (list preview, unread badge), ChatConversation |
| `chat:deleted` | `group:<gid>` / `staff:<gid>` | `{ id, groupId, channel }` | ChatConversation, ChatPage |
| `notification:new` | `user:<id>` | the notification | bell (+1, toast), NotificationsPage, AnnouncementsPage (reload) |
| `notification:updated` | `user:<id>` | the collapsed chat notification | bell, NotificationsPage (move to top) |
| `notification:sync` | `user:<id>` | `{ unreadCount }` | bell, NotificationsPage, ChatPage — sent after read / read-all / delete / chat read, so all open tabs agree |

---

## 7. Frontend behaviour

**ChatPage** (`/chat?groupId=&channel=`, UI fig 48)
- Left: conversations grouped by team, with search, last message ("You:" for your own), time and
  unread badge. Right: the open conversation.
- Messages show the sender, role badge and time at the start of each "run" (same sender, < 5 minutes
  apart), day separators ("Today", "Yesterday"), your messages on the right in a dark bubble, links
  are clickable. The view scrolls to the newest message; if you scrolled up, a "N new messages" button
  appears instead. "Load older messages" loads the previous 50 and keeps your position.
- Composer: Enter sends, Shift+Enter adds a line; the text is kept if sending fails (UC6/UC12
  exceptional flow) and a toast explains the problem. Own messages can be deleted (with confirmation).
- The header shows "Live" or "Reconnecting..."; after reconnecting, missed messages are fetched.
- A link with only `groupId` opens the default channel; a channel the user cannot use shows
  "This conversation is not available". On wide screens the first conversation opens automatically.
- Phones (≤ 768px): the list and the conversation are separate views; the conversation has a back button.

**NotificationBell** (Navbar): unread count badge, dropdown with the latest 8 (icon by type, title,
message, time, unread dot), click = mark read + open the link, "Mark all as read", "View all
notifications". Closes on outside click and Escape. A new notification shows a toast, except when the
user is already on that page (e.g. the open chat).

**NotificationsPage**: All / Unread tabs with counts, click to open, mark read, delete (confirmation),
"Mark all as read"; updates live.

**AnnouncementsPage** (UI fig 44): cards with a date tile, title, audience badge ("Everyone",
"Students", "Team Alpha", "Team Alpha · Students"), "New" for the last 3 days, text with "Read more",
publisher + role, date, "Edited". Audience filter chips and search. Supervisors/admins get
"New announcement": admins choose Everyone / all students / all supervisors / all examiners / one group;
supervisors choose one of their groups; "Who in the group?" = everyone or students only.
**Save draft** keeps an unfinished new announcement in this browser (UC7 alternative flow).

**ResourcesPage** (UI fig 45): category chips with counts (emoji icons like the prototype), search,
cards with description, category badge, website name and "Open" (new tab, `rel="noreferrer"`).
Supervisors/admins add resources; edit/delete buttons appear only where `canEdit` is true.

---

## 8. Testing

`npm run test:smoke` (see the main README) covers this area: the chat channels of each role, sending
a message and receiving it live over Socket.IO (and not in another group), unread counts and marking a
channel read, 403 for student→Staff / examiner→Group / another group / admin, deleting your own
message, announcement visibility for every role, notifications (read-all, someone else's → 404) and
adding, editing and deleting resources (including a non-http link → 400).

Handy demo steps: sign in as **student1** and **student2** in two browsers, open `/chat` in both and
type — messages appear instantly and the other user's bell shows "New message in Team Alpha — Group chat",
which becomes "2 new messages ..." instead of a second notification.
