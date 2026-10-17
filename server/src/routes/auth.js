import { Router } from 'express';
import { store } from '../store/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/register', async (req, res, next) => {
  try {
    const { username, displayName } = req.body || {};
    const result = await store.register({ username, displayName });
    if (result.error) {
      const status = result.error.code === 'USERNAME_TAKEN' ? 409 : 400;
      return res.status(status).json({ error: result.error });
    }
    const token = store.createSession(result.data.id);
    res.status(201).json({ data: { user: result.data, token } });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { username } = req.body || {};
    if (!username) {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: 'username is required' },
      });
    }
    const result = await store.login(username);
    if (result.error) {
      return res.status(404).json({ error: result.error });
    }
    const token = store.createSession(result.data.id);
    res.json({ data: { user: result.data, token } });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    store.revokeSession(req.sessionToken);
    store.setPresence(req.user.id, 'offline');
    res.json({ data: { ok: true } });
  } catch (err) {
    next(err);
  }
});

export default router;
