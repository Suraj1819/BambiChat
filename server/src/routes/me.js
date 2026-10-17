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
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
