import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { store } from '../store/index.js';

const router = Router();

router.post('/:id/messages/:messageId/reactions', requireAuth, async (req, res, next) => {
  try {
    const result = await store.addReaction(
      req.params.messageId,
      req.params.id,
      req.user.id,
      req.body?.emoji
    );
    if (result.error) {
      return res.status(result.error.code === 'FORBIDDEN' ? 403 : 400).json({ error: result.error });
    }
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/messages/:messageId/reactions', requireAuth, async (req, res, next) => {
  try {
    const result = await store.removeReaction(
      req.params.messageId,
      req.user.id,
      req.body?.emoji || req.query?.emoji
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/state', requireAuth, async (req, res, next) => {
  try {
    const result = await store.setConversationUserState(req.params.id, req.user.id, {
      mutedUntil: req.body?.mutedUntil ?? undefined,
      archivedAt: req.body?.archivedAt ?? undefined,
      pinnedAt: req.body?.pinnedAt ?? undefined,
    });
    if (result.error) return res.status(403).json({ error: result.error });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
