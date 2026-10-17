# Bambi API — Stage 4

## Auth

### POST /api/v1/auth/register
`{ "username", "displayName?" }` → `{ user, token }`

### POST /api/v1/auth/login
`{ "username" }` → `{ user, token }`

### POST /api/v1/auth/logout
Bearer required.

All other endpoints require `Authorization: Bearer <token>`.

## Real-time (Socket.IO)

Handshake: `auth: { token }`

| Event | Direction | Purpose |
|-------|-----------|---------|
| connection:ready | S→C | Connected |
| conversation:join | C→S | Join room (membership checked) |
| message:send | C→S | Encrypted message; ack with saved record |
| message:new | S→C | New ciphertext in room |
| message:notify | S→C | Ping members not in room |
| message:delivered / message:read | C→S | Receipts |
| message:receipt | S→C | Receipt to sender |
| typing:start / typing:stop | C→S | Typing |
| typing:update | S→C | Peer typing |
| presence:update | S→C | Online/offline |

## Messages

POST body must include `ciphertext`, `protocolVersion`, `clientMessageId`.  
Plaintext `body` rejected for E2EE protocol versions.
