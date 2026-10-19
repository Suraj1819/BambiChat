import { Router } from 'express';
import { store } from '../store/index.js';
import { requireAuth } from '../middleware/auth.js';
import {
  isSupabaseConfigured,
  sendEmailOtp,
  verifyEmailOtp,
} from '../lib/supabaseAuth.js';
import {
  isResendConfigured,
  sendOtpViaResend,
  verifyOtpViaResend,
} from '../lib/resendOtp.js';
import { randomBytes, createHash } from 'crypto';

const router = Router();
const registerSessions = new Map();

function hash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

router.post('/otp/request', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const purpose = req.body?.purpose === 'register' ? 'register' : 'login';

    if (!isValidEmail(email)) {
      return res.status(400).json({
        error: { code: 'INVALID_EMAIL', message: 'Enter a valid email address' },
      });
    }

    let exists = false;
    if (typeof store.findUserIdByEmail === 'function') {
      const id = await store.findUserIdByEmail(email);
      exists = Boolean(id);
    }

    if (purpose === 'login' && !exists) {
      return res.status(404).json({
        error: { code: 'USER_NOT_FOUND', message: 'No account with that email' },
      });
    }
    if (purpose === 'register' && exists) {
      return res.status(409).json({
        error: {
          code: 'EMAIL_TAKEN',
          message: 'This email is already registered. Please log in.',
        },
      });
    }

    // Prefer Resend (reliable custom "Bambi Chat" emails)
    if (isResendConfigured()) {
      const result = await sendOtpViaResend(email, purpose);
      if (result.error) {
        return res.status(400).json({ error: result.error });
      }
      return res.json({ data: result.data });
    }

    // Fallback: Supabase Auth email
    if (isSupabaseConfigured()) {
      const result = await sendEmailOtp(email, {
        createUser: purpose === 'register',
      });
      if (result.error) {
        return res.status(400).json({ error: result.error });
      }
      return res.json({
        data: {
          email,
          purpose,
          expiresInSec: 600,
          message: 'OTP sent to your email from Bambi Chat',
          provider: 'supabase',
        },
      });
    }

    return res.status(503).json({
      error: {
        code: 'EMAIL_NOT_CONFIGURED',
        message:
          'Set RESEND_API_KEY (recommended) or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in server .env',
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/otp/verify', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || '').trim();
    const purpose = req.body?.purpose === 'register' ? 'register' : 'login';

    if (!isValidEmail(email) || !code) {
      return res.status(400).json({
        error: { code: 'OTP_INVALID', message: 'Email and code are required' },
      });
    }

    let verified = null;

    if (isResendConfigured()) {
      verified = verifyOtpViaResend(email, code, purpose);
      // If Resend store miss (server restart), try Supabase as secondary
      if (verified.error && isSupabaseConfigured()) {
        verified = await verifyEmailOtp(email, code);
      }
    } else if (isSupabaseConfigured()) {
      verified = await verifyEmailOtp(email, code);
    } else {
      return res.status(503).json({
        error: {
          code: 'EMAIL_NOT_CONFIGURED',
          message: 'Email OTP is not configured on the server.',
        },
      });
    }

    if (verified.error) {
      return res.status(400).json({ error: verified.error });
    }

    if (purpose === 'login') {
      const userId = await store.findUserIdByEmail?.(email);
      if (!userId) {
        return res.status(404).json({
          error: { code: 'USER_NOT_FOUND', message: 'No account with that email' },
        });
      }
      const p = await store.getProfile?.(userId);
      if (!p) {
        return res.status(404).json({
          error: { code: 'USER_NOT_FOUND', message: 'No account with that email' },
        });
      }
      const user = {
        id: p.userId || p.id || userId,
        username: p.username,
        displayName: p.displayName || p.display_name || p.username,
        avatarUrl: p.avatarUrl || p.avatar_url || null,
        about: p.about || '',
        email: p.email || email,
      };
      const token = store.createSession(userId);
      return res.json({ data: { token, user, verified: true } });
    }

    const otpToken = randomBytes(24).toString('hex');
    registerSessions.set(hash(otpToken), {
      email,
      expiresAt: Date.now() + 15 * 60 * 1000,
    });

    res.json({
      data: {
        otpToken,
        email,
        verified: true,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/register/complete', async (req, res, next) => {
  try {
    const { otpToken, username, displayName } = req.body || {};
    const rec = registerSessions.get(hash(otpToken || ''));
    if (!rec || rec.expiresAt < Date.now()) {
      return res.status(400).json({
        error: {
          code: 'OTP_SESSION_EXPIRED',
          message: 'Verification expired. Start again.',
        },
      });
    }

    if (typeof store.registerWithEmail !== 'function') {
      return res.status(500).json({
        error: { code: 'SERVER_ERROR', message: 'Registration not available' },
      });
    }

    const result = await store.registerWithEmail({
      email: rec.email,
      username,
      displayName,
    });
    if (result.error) {
      const status =
        result.error.code === 'USERNAME_TAKEN' || result.error.code === 'EMAIL_TAKEN'
          ? 409
          : 400;
      return res.status(status).json({ error: result.error });
    }

    registerSessions.delete(hash(otpToken));
    const token = store.createSession(result.data.id);
    res.status(201).json({ data: { token, user: result.data } });
  } catch (err) {
    next(err);
  }
});

router.post('/register', async (req, res, next) => {
  try {
    const { username, displayName, phone } = req.body || {};
    const result = await store.register({ username, displayName, phone });
    if (result.error) {
      const status =
        result.error.code === 'USERNAME_TAKEN' || result.error.code === 'PHONE_TAKEN'
          ? 409
          : 400;
      return res.status(status).json({ error: result.error });
    }
    const token = store.createSession(result.data.id);
    res.status(201).json({ data: { token, user: result.data } });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { username, phone } = req.body || {};
    const result = await store.login(username, phone);
    if (result.error) {
      return res.status(404).json({ error: result.error });
    }
    const token = store.createSession(result.data.id);
    res.json({ data: { token, user: result.data } });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    if (typeof store.revokeSession === 'function') {
      await store.revokeSession(req.token);
    }
    res.json({ data: { ok: true } });
  } catch (err) {
    next(err);
  }
});

export default router;
