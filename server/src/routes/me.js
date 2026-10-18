import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { store } from '../store/index.js';

const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const profile = await store.getProfile(req.user.id);
    if (!profile) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Profile not found' },
      });
    }
    res.json({
      data: {
        id: profile.userId || profile.id,
        username: profile.username,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        about: profile.about,
        phoneDiscoverable: profile.phoneDiscoverable,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/', requireAuth, async (req, res, next) => {
  try {
    const result = await store.updateProfile(req.user.id, req.body || {});
    if (result.error) {
      return res.status(404).json({ error: result.error });
    }
    // Broadcast profile/avatar change to friends so UI stays in sync
    try {
      const io = req.app.get('io');
      if (io && result.data) {
        const friends = await store.listFriends(req.user.id);
        const payload = {
          userId: req.user.id,
          displayName: result.data.displayName,
          avatarUrl: result.data.avatarUrl,
          about: result.data.about,
        };
        for (const f of friends) {
          const sockets = io.sockets.adapter.rooms.get(`user:${f.id}`);
          // emitToUser pattern via room
          io.to(`user:${f.id}`).emit('profile:updated', payload);
        }
        // Also notify own other sessions
        io.to(`user:${req.user.id}`).emit('profile:updated', payload);
      }
    } catch {
      /* non-fatal */
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/privacy', requireAuth, async (req, res, next) => {
  try {
    const data = await store.getPrivacy(req.user.id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.patch('/privacy', requireAuth, async (req, res, next) => {
  try {
    const allowed = ['lastSeen', 'onlineStatus', 'profilePhoto', 'readReceipts'];
    const patch = {};
    for (const k of allowed) {
      if (req.body?.[k] !== undefined) patch[k] = req.body[k];
    }
    const result = await store.setPrivacy(req.user.id, patch);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/calls', requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    if (typeof store.listCallHistory !== 'function') {
      return res.json({ data: [] });
    }
    const data = await store.listCallHistory(req.user.id, limit);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
