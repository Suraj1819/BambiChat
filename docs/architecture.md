# Bambi Architecture (Stage 1)

## Overview

Bambi is a monorepo containing a React SPA and a Node.js API/real-time server.

```
┌─────────────┐     HTTPS / WSS      ┌──────────────────┐
│   Browser   │◄────────────────────►│  Express + IO    │
│  (React)    │                      │  (Node.js)       │
└──────┬──────┘                      └────────┬─────────┘
       │                                      │
       │ Web Crypto / IndexedDB               │ service role
       │ (keys, ciphertext)                   ▼
       │                               ┌──────────────┐
       │                               │  PostgreSQL  │
       │                               │  (Supabase)  │
       │                               └──────────────┘
       │                                      │
       │ short-lived signed URLs              │
       ▼                                      ▼
┌─────────────┐                        ┌──────────────┐
│ Private S3  │                        │ Supabase Auth│
│  (media)    │                        │  (phone OTP) │
└─────────────┘                        └──────────────┘
```

## Principles

1. **Ciphertext only on the server** — plaintext never leaves the client for private messages.
2. **Explicit authorization** — every REST and Socket event checks membership / blocks / roles.
3. **Privacy by default** — phone numbers not searchable unless the user opts in.
4. **No silent degradation** — encryption or storage failure blocks the send; never falls back to plaintext.

## Stage Map

| Stage | Focus |
|-------|--------|
| 0     | Audit & architecture (done) |
| 1     | Foundation: monorepo, design system, UI shell, backend skeleton, profiles migration |
| 2     | Friends, discovery, direct conversations |
| 3     | Signal Protocol device identity & E2EE DMs |
| 4     | Real-time delivery, receipts, offline |
| 5     | Encrypted media |
| 6     | Groups + group crypto |
| 7     | Product polish (reactions, edit, delete, PWA…) |
| 8     | Tests, security review, deployment |

## Client Structure

- `components/ui` — design-system primitives
- `components/layout` — AppShell, Sidebar
- `components/chat` — conversation list, header, bubbles, composer, timeline
- `features/*` — domain modules (auth, friends, encryption…) — populated in later stages
- `pages` — route-level screens

## Server Structure

- `config` — env, constants
- `middleware` — auth, validation, errors
- `routes` / `controllers` / `services` / `repositories`
- `sockets` — authenticated event handlers
- `validators` — Zod schemas

## Encryption Note

Stage 1 does not integrate a Signal Protocol library. Stage 3 will evaluate maintained browser-compatible options and document limitations (key storage, multi-device, recovery). No custom protocol will be invented.
