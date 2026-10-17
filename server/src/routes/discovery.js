import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { store } from '../store/index.js';

const router = Router();

router.get('/users', requireAuth, async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ data: [] });
    const results = await store.searchByUsername(q, req.user.id);
    res.json({ data: results });
  } catch (err) {
    next(err);
  }
});

export default router;
