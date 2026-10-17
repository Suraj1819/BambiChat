# Bambi Release Checklist

## Security

- [ ] No service-role keys in client bundle
- [ ] CORS locked to production origin
- [ ] HTTPS / WSS only in production
- [ ] Message API rejects plaintext body for E2EE protocols
- [ ] Attachment download requires membership
- [ ] RLS enabled on Supabase tables (service role still needs API checks)
- [ ] Rate limits on auth and messaging
- [ ] Dependencies audited (`npm audit`)

## Functionality

- [ ] Register / login / logout
- [ ] Friend request lifecycle
- [ ] Direct E2EE message send/receive (two browsers)
- [ ] Delivery + read receipts
- [ ] Typing + presence
- [ ] Encrypted image/file attach + download
- [ ] Group create / add / remove / leave
- [ ] Group messages decrypt for members

## Ops

- [ ] `supabase_full_schema.sql` applied
- [ ] Migrations documented
- [ ] Env vars set on host
- [ ] Health endpoint monitored
- [ ] Backup strategy for Postgres + object storage

## Known limitations (document to users)

- E2EE is `bambi-e2ee-v1` / group shared key — not full Signal Double Ratchet
- Browser IndexedDB key storage is not hardware-backed
- In-memory server store resets on process restart until Postgres repos are wired
- Deleted messages are not erased from other devices’ already-decrypted state
