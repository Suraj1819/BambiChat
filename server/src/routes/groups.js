import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { store } from '../store/index.js';

const router = Router();

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { title, memberIds } = req.body || {};
    const result = await store.createGroup(req.user.id, { title, memberIds });
    if (result.error) {
      const status = result.error.code === 'USER_NOT_FOUND' ? 404 : 400;
      return res.status(status).json({ error: result.error });
    }
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await store.getGroupDetails(req.params.id, req.user.id);
    if (result.error) {
      return res.status(result.error.code === 'FORBIDDEN' ? 403 : 404).json({ error: result.error });
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await store.updateGroup(req.params.id, req.user.id, req.body || {});
    if (result.error) {
      return res.status(result.error.code === 'FORBIDDEN' ? 403 : 404).json({ error: result.error });
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/members', requireAuth, async (req, res, next) => {
  try {
    const result = await store.addGroupMembers(req.params.id, req.user.id, req.body?.memberIds || []);
    if (result.error) {
      return res.status(result.error.code === 'FORBIDDEN' ? 403 : 404).json({ error: result.error });
    }
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/members/:userId', requireAuth, async (req, res, next) => {
  try {
    const result = await store.removeGroupMember(req.params.id, req.user.id, req.params.userId);
    if (result.error) {
      return res.status(result.error.code === 'FORBIDDEN' ? 403 : 404).json({ error: result.error });
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/members/:userId/role', requireAuth, async (req, res, next) => {
  try {
    const result = await store.setMemberRole(req.params.id, req.user.id, req.params.userId, req.body?.role);
    if (result.error) {
      return res.status(result.error.code === 'FORBIDDEN' ? 403 : 400).json({ error: result.error });
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
