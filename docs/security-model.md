# Bambi Security Model — Stage 3

## Objective

The messaging service must be unable to read the plaintext of private direct messages during normal operation.

## Trust boundaries

| Boundary | Trust |
|----------|--------|
| Client device | Trusted to hold private keys; vulnerable to XSS, malware, physical access |
| Browser origin | Isolated by same-origin policy; private keys in IndexedDB |
| Bambi server | **Untrusted for message content**; sees ciphertext, metadata, membership |
| Database | Stores ciphertext + routing metadata only |
| Network | TLS (HTTPS/WSS) in production |

## Stage 3 protocol: `bambi-e2ee-v1`

### Design

- **Identity keys**: ECDH P-256 key pairs generated in the browser (Web Crypto API).
- **Session keys**: Per-conversation shared secrets derived via ECDH between the local identity private key and the peer’s published public identity key, then HKDF-SHA-256.
- **Message encryption**: AES-256-GCM with a random 12-byte IV per message; AAD binds conversation id + sender id + client message id.
- **Key storage**: Private keys in IndexedDB only (never `localStorage`). Public keys uploaded to the server.
- **Server role**: Stores and routes **ciphertext** and public key material. Never receives plaintext for private messages.

### What the server can see

- Who is talking to whom (membership)
- Message timestamps and sizes
- Ciphertext blobs
- Public identity keys

### What the server cannot see (under this model)

- Message plaintext
- Attachment plaintext (Stage 5)
- Private keys

### Honest limitations (Stage 3)

1. **Not full Signal Protocol** — No Double Ratchet, no one-time prekey X3DH handshake, no forward secrecy ratchet per message. Session secret is static per identity-pair until keys are rotated.
2. **Single-device focus** — Multi-device key distribution is scaffolded (device records) but not fully productized.
3. **No sealed sender** — Server learns sender identity.
4. **Metadata exposed** — Conversation graph and timing are visible to the service.
5. **Browser storage** — IndexedDB is not hardware-backed; XSS can exfiltrate keys. CSP and careful dependency hygiene are required.
6. **Identity change** — If a peer’s public key changes, the client should surface a warning (basic check implemented). Full TOFU / safety-number UX is Stage 7+.

### Path to Signal Protocol

Stage 3 intentionally uses Web Crypto primitives so the product works without unverified native bridges. A future stage may replace the crypto adapter with a maintained Signal Protocol WASM/TS implementation once browser packaging and licensing are validated. The message envelope (`protocol_version`, ciphertext, client_message_id) is designed so the transport layer does not need to change.

## Authorization (independent of crypto)

- Every REST handler checks authentication.
- Conversation read/write requires membership.
- Friend relationship required to open a direct chat.
- Blocks prevent messaging and requests.
- Server **rejects** message submissions that lack ciphertext when `protocol_version` indicates E2EE.

## Threat model (summary)

| Threat | Mitigation |
|--------|------------|
| Server reads messages | Client-side encryption; no plaintext column |
| Malicious user reads others’ chats | Membership checks on every fetch/send |
| Replay | client_message_id uniqueness per conversation |
| Key substitution | Publish keys only for authenticated devices; client warns on identity change |
| XSS → key theft | CSP, no inline scripts, minimize DOM XSS surface; keys not in localStorage |
| Compromised device | Out of scope for server-side E2EE claims |

## Explicit non-claims

- We do **not** claim immunity from compromised client devices.
- We do **not** claim full Signal Protocol guarantees in Stage 3.
- We do **not** claim that deleted messages are erased from other users’ devices.
