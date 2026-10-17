# Bambi Deployment Guide

## Prerequisites

- Node.js ≥ 20
- Supabase project (Postgres + optional Auth phone OTP)
- S3-compatible storage for media (or local `server/uploads` for small deploys)
- Hosting with WebSocket support for the API (Railway, Fly.io, Render, etc.)
- Static host for the client (Vercel, Netlify, Cloudflare Pages)

## 1. Database (Supabase)

1. Create a Supabase project.
2. Open **SQL Editor** and run:

```bash
# Full one-shot schema (recommended)
database/supabase_full_schema.sql
```

Or apply numbered migrations in order:

```
database/migrations/001_initial_profiles.sql
database/migrations/002_friends_conversations.sql
database/migrations/003_devices_keys_messages.sql
database/migrations/004_attachments.sql
database/migrations/005_groups.sql
database/migrations/006_product_completion.sql
```

3. Copy **Project URL**, **anon key**, **service role key**, and **Database connection string**.

### Optional: Supabase Auth phone OTP

Configure an SMS provider in Supabase Auth → Providers → Phone.  
Then replace username session auth in `server/src/routes/auth.js` with Supabase JWT verification (`SUPABASE_JWT_SECRET` / JWKS).

## 2. Environment

```bash
cp .env.example .env
```

| Variable | Where |
|----------|--------|
| `VITE_API_URL` / `VITE_SOCKET_URL` | Client (production API origin) |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Client (if using Supabase Auth) |
| `PORT`, `CLIENT_ORIGIN` | Server |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Server |
| `DATABASE_URL` | Server (when using Postgres repo instead of memory store) |
| `S3_*` | Server media (optional; defaults to local disk) |

**Never** expose the service role key to the browser.

## 3. Local development

```bash
npm install
npm run dev
```

- Client: http://localhost:5173  
- API + Socket.IO: http://localhost:4000  

Current Node server uses an in-memory store for zero-config local runs.  
Point repositories at Postgres when `DATABASE_URL` is set (integration path documented in architecture).

## 4. Production build

```bash
# Client
cd client && npm run build
# Deploy client/dist to Vercel/Netlify; SPA fallback to index.html

# Server
cd server && npm start
# Process manager: systemd, PM2, or platform start command
# Ensure sticky sessions or Redis adapter if scaling Socket.IO horizontally
```

## 5. CORS & cookies

Set `CLIENT_ORIGIN` to the exact frontend origin.  
Use HTTPS and WSS in production.

## 6. Storage

- Local: `server/uploads/` (gitignored)
- Production: private S3/R2 bucket; short-lived download only after membership checks

## 7. Operational notes

- Free tiers may sleep processes (WebSockets drop) — use always-on plan for chat.
- SMS OTP costs money; rate-limit aggressively.
- Back up Postgres regularly; ciphertext backups do not expose plaintext messages.
- Rotate secrets periodically.

## 8. Health checks

- `GET /health` — process up
- `GET /api/v1` — API version / stage
