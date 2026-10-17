/** Application-wide constants */

export const APP_NAME = 'Bambi';
export const APP_VERSION = '0.3.0';

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const USERNAME_REGEX = /^[a-z][a-z0-9_]{2,29}$/;

export const MAX_MESSAGE_LENGTH = 4096;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export const CONVERSATION_TYPES = {
  DIRECT: 'direct',
  GROUP: 'group',
};

export const MESSAGE_STATUS = {
  PENDING: 'pending',
  SENDING: 'sending',
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
  FAILED: 'failed',
};

export const FRIEND_REQUEST_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
};

export const MEMBER_ROLES = {
  MEMBER: 'member',
  ADMIN: 'admin',
  OWNER: 'owner',
};

export const PROTOCOL_VERSION = 'bambi-e2ee-v1';
