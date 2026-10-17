# Bambi

Private, real-time, end-to-end encrypted messaging for the web.

**Version 1.0.0 — Stages 1–8 complete (application + Supabase schema)**

## Features

| Area | Capability |
|------|------------|
| Accounts | Register / login (session token); Supabase Auth path documented |
| Social | Username search, friends, blocks |
| Chat | Direct + group conversations |
| E2EE | Client-side ECDH + AES-GCM (`bambi-e2ee-v1`); ciphertext-only server |
| Media | Client-encrypted uploads; membership-gated download |
| Realtime | Socket.IO messages, receipts, typing, presence |
| Groups | Create, roles, add/remove, leave + group key distribution |
| Product | Reactions API, mute/archive state, PWA shell |
| Database | Full Supabase/Postgres SQL + RLS policies |


## Supabase / Postgres connection

1. Put `DATABASE_URL` in root `.env` (from Supabase → Settings → Database → URI).
2. Also set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
3. Restart server: `npm run dev`
4. Check: `curl http://localhost:4000/health` → `"database":"postgres"`
5. Register a user → open Supabase **Table Editor** → `profiles` → new row.

If `DATABASE_URL` is missing or connection fails, the server falls back to in-memory store and logs a warning.


## Quick start (local)

```bash
npm install
npm run dev
```

- App: http://localhost:5173  
- API: http://localhost:4000  

1. Create two accounts (two browser profiles).  
2. Search → friend request → accept → chat.  
3. Attach files; create groups from the header.

## Supabase database

**One-shot schema (recommended):**

```bash
# In Supabase SQL Editor, run:
database/supabase_full_schema.sql
```

**Incremental migrations:**

```
database/migrations/001_initial_profiles.sql
database/migrations/002_friends_conversations.sql
database/migrations/003_devices_keys_messages.sql
database/migrations/004_attachments.sql
database/migrations/005_groups.sql
database/migrations/006_product_completion.sql
```

See **docs/deployment.md** for production setup.

## Project layout

```
bambi/
├── client/                 # React + Vite + Tailwind + Web Crypto + Socket.IO
├── server/                 # Express + Socket.IO
├── database/
│   ├── migrations/         # Ordered SQL migrations
│   └── supabase_full_schema.sql
├── docs/
│   ├── architecture.md
│   ├── security-model.md
│   ├── api-contracts.md
│   ├── deployment.md
│   └── release-checklist.md
├── shared/
└── README.md
```

## Security (summary)

- Private keys stay in the browser (IndexedDB).  
- Server stores **ciphertext only** for messages and files.  
- Authorization on every REST and socket action.  
- Not full Signal Protocol — see `docs/security-model.md`.

## Scripts

```bash
npm run dev          # client + server
npm run build        # production client build
npm run dev:client
npm run dev:server
```

## License

Private project.
