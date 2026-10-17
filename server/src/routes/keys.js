import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { store } from '../store/index.js';

const router = Router();

router.post('/identity', requireAuth, async (req, res, next) => {
  try {
    const result = await store.publishIdentityKey(req.user.id, req.body || {});
    if (result.error) return res.status(400).json({ error: result.error });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/identity/:userId', requireAuth, async (req, res, next) => {
  try {
    const key = await store.getIdentityKey(req.params.userId);
    if (!key) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No identity key' } });
    }
    res.json({ data: key });
  } catch (err) {
    next(err);
  }
});

router.get('/identity', requireAuth, async (req, res, next) => {
  try {
    const key = await store.getIdentityKey(req.user.id);
    if (!key) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No identity key' } });
    }
    res.json({ data: key });
  } catch (err) {
    next(err);
  }
});

export default router;
