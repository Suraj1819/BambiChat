import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { store } from '../store/index.js';

const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    res.json({ data: await store.listBlocked(req.user.id) });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { userId } = req.body || {};
    if (!userId) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'userId required' } });
    }
    const result = await store.blockUser(req.user.id, userId);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.delete('/:userId', requireAuth, async (req, res, next) => {
  try {
    res.json(await store.unblockUser(req.user.id, req.params.userId));
  } catch (err) {
    next(err);
  }
});

export default router;
