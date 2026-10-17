/**
 * Conceptual Zod-like schemas for friends / discovery (shared documentation).
 * Server uses plain validation; client can import shapes later.
 */

export const usernameSearchSchema = {
  q: { type: 'string', min: 1, max: 30 },
};

export const friendRequestSchema = {
  toUserId: { type: 'string', format: 'uuid' },
};

export const blockSchema = {
  userId: { type: 'string', format: 'uuid' },
};
