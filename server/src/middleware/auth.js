import { store } from '../store/index.js';

async function resolveUser(token) {
  if (!token) return null;
  if (typeof store.resolveSessionAsync === 'function') {
    return store.resolveSessionAsync(token);
  }
  const session = store.resolveSession(token);
  if (!session) return null;
  const profile = store.getProfile
    ? await Promise.resolve(store.getProfile(session.userId))
    : session.profile;
  if (!profile) return null;
  return {
    userId: session.userId,
    profile: profile.userId ? profile : { ...profile, user_id: session.userId },
  };
}

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
    const token = bearer || req.headers['x-session-token'] || null;
    const session = await resolveUser(token);
    if (!session) {
      return res.status(401).json({
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required. Sign in to continue.',
        },
      });
    }
    const p = session.profile;
    req.user = {
      id: session.userId,
      username: p.username || p.user_id,
      displayName: p.display_name || p.displayName || p.username,
    };
    req.sessionToken = token;
    next();
  } catch (err) {
    next(err);
  }
}

export async function optionalAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
    const token = bearer || req.headers['x-session-token'] || null;
    const session = await resolveUser(token);
    if (session) {
      const p = session.profile;
      req.user = {
        id: session.userId,
        username: p.username || p.user_id,
        displayName: p.display_name || p.displayName || p.username,
      };
      req.sessionToken = token;
    }
    next();
  } catch (err) {
    next(err);
  }
}
