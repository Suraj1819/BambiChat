# Bambi Messenger — reference redesign + calls + settings

## What's new
**Calls (new)** — one-to-one audio and video calls over WebRTC.
- Phone and video buttons in the chat header and in the contact panel (direct chats only).
- Full-screen incoming / calling / connecting / active screens, mute, camera on/off, call timer, ringtone, missed/declined/busy notices, picture-in-picture self view.
- Media is peer-to-peer; signalling uses your existing Socket.IO connection.
- Files: `src/features/calls/{useCall.js, CallOverlay.jsx, ringtone.js}`, `server/calls.socket.js`.

**Settings (rebuilt)** — Profile, Account, Privacy (with working Blocked contacts list/unblock), Notifications, Calls (mic / camera / speaker pickers, echo cancellation, noise suppression, ringtone), Appearance (Light / Dark / System), Chats (Enter-to-send toggle), Shortcuts, Help.

**UI, following your reference screens** — large "Chats" header with round action buttons, pill search, All / Unread / Groups chips, bolder unread rows, rounded bubbles with time + ticks inside the bubble, pill-style attach tray (Files / Images / Video), round send button, auto-growing input, contact drawer with Audio / Video / Search pills, shared media/files and Block, in-chat search.

**Theme** — Light / Dark / System, applied before first paint; existing saved light/dark choices are kept.

## You must do two things for calls to work
1. **Add the relay to your server** (the zip had no backend):
   ```js
   import { registerCallHandlers } from './calls.socket.js';
   io.on('connection', (socket) => registerCallHandlers(io, socket, {
     canCall: async (callerId, calleeId) => /* friends && not blocked */ true,
     getProfile: async (id) => ({ displayName, username, avatarUrl }),
   }));
   ```
   It assumes `socket.data.userId` holds the authenticated user id — change that line if yours differs.
2. **Use HTTPS** (browsers only allow camera/mic on HTTPS or localhost). For users behind strict NATs/mobile networks add a TURN server:
   `VITE_ICE_SERVERS='[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:YOUR_HOST:3478","username":"u","credential":"p"}]'`

## Install
Replace your project's `src/` with this `src/`, add `server/calls.socket.js` to your backend, keep your existing config. No new npm dependencies.

## Verified / not verified
- Verified: all JSX bundles and every import resolves (esbuild); the server relay passes 12 integration tests with real Socket.IO clients (invite, accept, signal relay, outsider blocked, busy, forbidden, offline, self-call, invalid signal, end, disconnect-ends-call).
- **Not verified:** a live browser-to-browser call (needs two devices/cameras), the Tailwind build/visual rendering (no Tailwind config in the zip), lint, or your tests.

## Not done, and why
- **Phone-number OTP login** — needs an SMS provider and backend endpoints; the current API is username-only. I did not fake it.
- **Profile name/photo sync to other users, pin/mute/archive, reactions, replies, edit/delete, read-receipt privacy** — no backend endpoints exist; these controls are not shown.
- **Group calls, and upgrading an audio call to video mid-call** — not implemented.
- **Audio-file attachments** — your allowed-types list excludes audio, so the Audio chip is omitted.
