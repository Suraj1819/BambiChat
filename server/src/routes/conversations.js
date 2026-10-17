import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { store } from '../store/index.js';

const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    res.json({ data: await store.listConversations(req.user.id) });
  } catch (err) {
    next(err);
  }
});

router.post('/direct', requireAuth, async (req, res, next) => {
  try {
    const { userId } = req.body || {};
    if (!userId) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'userId required' } });
    }
    const result = await store.getOrCreateDirectConversation(req.user.id, userId);
    if (result.error) {
      const status = result.error.code === 'NOT_FRIENDS' ? 403 : 400;
      return res.status(status).json({ error: result.error });
    }
    res.status(result.data.existing ? 200 : 201).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/messages', requireAuth, async (req, res, next) => {
  try {
    const result = await store.getMessages(req.params.id, req.user.id);
    if (result.error) {
      return res.status(result.error.code === 'FORBIDDEN' ? 403 : 404).json({ error: result.error });
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/messages', requireAuth, async (req, res, next) => {
  try {
    const result = await store.sendMessage(req.params.id, req.user.id, req.body || {});
    if (result.error) {
      const status = result.error.code === 'FORBIDDEN' ? 403 : 400;
      return res.status(status).json({ error: result.error });
    }
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
