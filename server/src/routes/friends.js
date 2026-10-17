import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { store } from '../store/index.js';

const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    res.json({ data: await store.listFriends(req.user.id) });
  } catch (err) {
    next(err);
  }
});

router.get('/requests', requireAuth, async (req, res, next) => {
  try {
    res.json({
      data: {
        incoming: await store.listPendingIncoming(req.user.id),
        outgoing: await store.listPendingOutgoing(req.user.id),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/requests', requireAuth, async (req, res, next) => {
  try {
    const { toUserId } = req.body || {};
    if (!toUserId) {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: 'toUserId is required' },
      });
    }
    const result = await store.sendFriendRequest(req.user.id, toUserId);
    if (result.error) {
      const status = result.error.code === 'USER_NOT_FOUND' ? 404 : 409;
      return res.status(status).json({ error: result.error });
    }
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/requests/:id/accept', requireAuth, async (req, res, next) => {
  try {
    const result = await store.acceptFriendRequest(req.params.id, req.user.id);
    if (result.error) return res.status(404).json({ error: result.error });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/requests/:id/reject', requireAuth, async (req, res, next) => {
  try {
    const result = await store.rejectFriendRequest(req.params.id, req.user.id);
    if (result.error) return res.status(404).json({ error: result.error });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/requests/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    const result = await store.cancelFriendRequest(req.params.id, req.user.id);
    if (result.error) return res.status(404).json({ error: result.error });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.delete('/:userId', requireAuth, async (req, res, next) => {
  try {
    const result = await store.removeFriend(req.user.id, req.params.userId);
    if (result.error) return res.status(404).json({ error: result.error });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
