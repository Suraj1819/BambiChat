# Bambi deploy — fix CSS/JS 404 (`index-XXXX.css`)

## Why this error happens
Vite build creates hashed files like `assets/index-BCAE0Ehf.css`.
`index.html` points to **that exact name**.

404 means either:
1. You deployed **old** `index.html` with **new** assets (or the reverse)
2. Assets folder was not uploaded
3. App is under a **subpath** but `base` is still `/`
4. CDN/browser cached old HTML

## Correct deploy steps

```bash
# 1. Install
npm install
cd server && npm install && cd ..

# 2. Build frontend (creates dist/ with index.html + assets/)
npm run build

# 3. Confirm assets exist
ls dist/assets/
# should show index-*.js and index-*.css

# 4. Start server (serves dist/ automatically)
cd server && npm start
```

## Environment

```env
PORT=4000
CLIENT_ORIGIN=https://your-domain.com
# Optional Postgres
# DATABASE_URL=postgresql://...

# Frontend build-time (optional if same origin)
# VITE_API_URL=
# VITE_SOCKET_URL=
```

When frontend and API are **same origin**, leave `VITE_API_URL` empty so requests go to `/api` and `/socket.io`.

## Platform tips

### Vercel / Netlify (static only)
- Build command: `npm run build`
- Publish directory: `dist`
- Add rewrite: all routes → `/index.html`
- API must be a **separate** backend URL; set `VITE_API_URL` and `VITE_SOCKET_URL` at build time

### Railway / Render / VPS (Node)
- Build: `npm install && cd server && npm install && cd .. && npm run build`
- Start: `cd server && npm start`
- Server serves `../dist` automatically

### After every deploy
Hard refresh: **Ctrl+Shift+R** (or clear cache).
Old hashed CSS names will 404 after a new build — that is expected for old tabs.

## Subpath deploy (e.g. example.com/bambi/)
In `vite.config.js` set:
```js
base: '/bambi/',
```
Rebuild, and host so `/bambi/assets/...` is reachable.
