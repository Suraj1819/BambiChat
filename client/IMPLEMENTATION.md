# Bambi Messenger — Architecture & Upgrade Summary

## 1. Existing architecture (discovered)

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Vite, React Router, TanStack Query, Socket.IO client |
| Backend | Express + Socket.IO on Node.js |
| Auth | Custom session tokens (`store.resolveSession` / `resolveSessionAsync`) |
| Database | Dual store: in-memory (default) or PostgreSQL/Supabase when `DATABASE_URL` is set |
| Real-time | Socket.IO with authenticated handshake (`socket.userId`) |
| Encryption | Client-side E2EE (`bambi-e2ee-v1`) — server never sees plaintext |
| File storage | Local `server/uploads/` disk (encrypted blobs) |
| UI | Custom design system (`bambi-*` CSS tokens), shared `Avatar` component |

**Already present before this pass**
- Friends, blocks, groups, conversations, messages
- Message send / delivered / read receipt events and DB receipts
- Basic online/offline presence via in-process socket map
- Profile avatar URL on user record + shared Avatar component
- Redesigned chat UI, Settings panel, CallOverlay, `useCall` WebRTC client
- Call signalling module (was not wired into `setupSockets`)

## 2. Features implemented / integrated in this pass

### Real-time calling (1:1 audio + video)
- Integrated `registerCallHandlers` into `server/src/sockets/index.js`
- Fixed auth binding: handlers use `socket.userId` (existing middleware)
- Events: `call:invite`, `call:incoming`, `call:accept` / `call:accepted`, `call:signal`, `call:reject` / `call:rejected`, `call:end` / `call:ended`, `call:missed`
- Authorization: friends only + not blocked (`store.canCall`)
- Busy detection, 45s ring timeout → missed call
- Call history persistence (`store.saveCallRecord` / `listCallHistory`)
- REST: `GET /api/v1/me/calls`
- Frontend already wires `useCall` + `CallOverlay` from chat header / contact panel

### Presence & last seen
- `setPresence` now tracks `lastSeen` when going offline
- `getPresenceForViewer` enforces privacy (`everyone` | `contacts` | `nobody`)
- Disconnect emits last-seen to friends
- `presence:subscribe` socket event for batch presence

### Privacy controls
- `GET/PATCH /api/v1/me/privacy`
- Fields: `lastSeen`, `onlineStatus`, `profilePhoto`, `readReceipts`
- Memory store + Postgres (`user_privacy` table)

### Profile picture sync
- Profile PATCH broadcasts `profile:updated` to friends and own sessions
- Shared `Avatar` component used in lists, headers, call UI

### Message delivery / read
- Already implemented: `message:delivered`, `message:read`, receipts persisted
- UI ticks in `MessageBubble` (existing redesign)

### Notifications
- In-app: `message:notify` socket event (existing)
- Preferences in `src/lib/preferences.js` (browser notifications toggle)
- Service worker registration stub in `main.jsx` (production)

## 3. Database migrations

File: `server/migrations/001_calls_privacy.sql`

```bash
# When using Postgres
psql "$DATABASE_URL" -f server/migrations/001_calls_privacy.sql
```

Creates:
- `call_records`
- `user_privacy`
- Ensures `profiles.avatar_url` exists

Memory store needs no migration (in-process maps).

## 4. Real-time event contracts (calls + presence)

| Event | Direction | Purpose |
|-------|-----------|---------|
| `presence:update` | server → client | `{ userId, status, lastSeen? }` |
| `presence:subscribe` | client → server | `{ userIds[] }` → ack with map |
| `profile:updated` | server → client | `{ userId, displayName, avatarUrl, about }` |
| `call:invite` | client → server | start call (ack) |
| `call:incoming` | server → client | incoming ring |
| `call:accept` / `call:accepted` | bidirectional | accept |
| `call:signal` | bidirectional | WebRTC SDP/ICE |
| `call:reject` / `call:rejected` | bidirectional | decline/busy |
| `call:end` / `call:ended` | bidirectional | hang up |
| `call:missed` | server → client | unanswered timeout |

## 5. Environment variables

```env
# Server
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://...          # optional; omit for memory store
NODE_ENV=development

# Frontend (Vite)
VITE_API_URL=http://localhost:4000
VITE_SOCKET_URL=http://localhost:4000
# Optional TURN for restrictive NATs (never put long-lived secrets in frontend in production —
# prefer short-lived credentials from a backend endpoint)
VITE_ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"}]
```

## 6. External services

| Need | Recommendation |
|------|----------------|
| STUN | Public Google STUN (already default in `useCall`) |
| TURN | coturn or a managed provider (Twilio, Cloudflare Calls, Metered) — required for many mobile/CGNAT networks |
| Group SFU | **Not implemented** — see §10. For production group video use LiveKit or mediasoup |
| Web Push | Optional; VAPID keys + service worker push handler not fully wired |

## 7. Commands

```bash
# Backend
cd server
npm install   # express, socket.io, pg, cors, helmet, morgan, multer, dotenv, ...
npm start     # or: node src/server.js

# Frontend (from monorepo root that owns package.json / vite.config)
npm install
npm run dev   # Vite on :5173

# Migration (Postgres)
psql "$DATABASE_URL" -f server/migrations/001_calls_privacy.sql
```

> Note: the uploaded zips contain `src/` and `server/` only. Restore your existing root `package.json`, `vite.config.js`, and `index.html` if they were outside these archives.

## 8. Deployment notes

- Serve frontend over **HTTPS** (camera/mic require secure context except localhost).
- Proxy `/socket.io` and `/api` to the Node process; enable WebSocket upgrade.
- Set `CLIENT_ORIGIN` to the real SPA origin.
- Apply migrations before enabling call history / privacy in production.
- For multi-instance backends, replace the in-process `userSockets` / `presence` maps with Redis (Socket.IO Redis adapter + shared presence keys).

## 9. Test checklist (two accounts, two browsers)

1. Register/login user A and user B; become friends.
2. Both appear online; close B’s tab → A sees offline + last seen.
3. A sends message → B receives in real time; ticks go sent → delivered → read when B opens chat.
4. A starts **audio** call from chat header → B sees incoming overlay with avatar/name → Accept → media flows; mute works; End ends for both.
5. Repeat with **video**; toggle camera; deny mic permission → graceful error.
6. Decline / ignore until timeout → missed call appears in history (`GET /api/v1/me/calls`).
7. B already in a call → A gets busy.
8. Update A’s avatar in Settings → B’s conversation list/header refresh via `profile:updated`.
9. Set privacy last-seen to Nobody → B no longer sees precise last seen.
10. Block B → A cannot place a call.

## 10. Intentionally incomplete / out of scope for this pass

| Item | Why |
|------|-----|
| **Group audio/video (SFU)** | Requires LiveKit/mediasoup (or similar) infrastructure, participant rooms, and a different media path. Mesh WebRTC does not scale. Socket.IO must not carry media. |
| **Web Push when browser closed** | Needs VAPID key pair, push subscription storage, and a complete service worker. In-app + Notification API when tab is open work via existing sockets. |
| **Redis multi-instance presence** | Single-process maps are correct for one Node instance; multi-node needs Redis. |
| **Full automated test suite** | Project had no existing test runner config in the archive; manual checklist above covers critical paths. |
| **TURN credential minting API** | Recommended next step: short-lived TURN credentials issued by authenticated backend endpoint. |
| **Native mobile push** | No native app in repository. |

## 11. Files changed / added

**Added**
- `server/src/sockets/calls.js` — production call relay
- `server/migrations/001_calls_privacy.sql`
- `IMPLEMENTATION.md` (this file)

**Updated**
- `server/src/sockets/index.js` — registers call handlers, user rooms, presence privacy
- `server/src/store/memoryStore.js` — lastSeen, privacy, canCall, call history
- `server/src/store/pgStore.js` — same + SQL-backed tables
- `server/src/routes/me.js` — privacy + call history endpoints
- `server/calls.socket.js` — synced with integrated module

**Frontend (from redesign zip, already present)**
- `src/features/calls/{useCall.js,CallOverlay.jsx,ringtone.js}`
- `src/components/chat/ConversationHeader.jsx`, `ContactInfoPanel.jsx`, `ChatPage.jsx`
- `src/components/ui/Avatar.jsx`, Settings, preferences, theme

## Definition of done (current status)

| Requirement | Status |
|-------------|--------|
| Real-time messaging | Yes (existing) |
| Online/offline + privacy-aware last seen | Yes |
| Profile picture sync across sessions | Yes |
| Message sent/delivered/read indicators | Yes (existing + UI) |
| In-app + tab notifications | Yes (socket + prefs) |
| 1:1 audio/video WebRTC | Yes (integrated) |
| Call history / missed calls | Yes |
| Group calls with SFU | **Not yet** (architecture decision required) |
| Web Push offline | Partial (SW stub only) |
