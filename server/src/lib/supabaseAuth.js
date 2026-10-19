/**
 * Supabase Auth email OTP via REST (no SDK required).
 * Configure SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY).
 * Sender name "Bambi Chat" is set in Supabase Dashboard → Authentication → Email Templates / SMTP.
 */

import { env } from '../config/env.js';

function baseUrl() {
  return String(env.supabaseUrl || '').replace(/\/$/, '');
}

function apiKey() {
  return env.supabaseServiceRoleKey || process.env.SUPABASE_ANON_KEY || '';
}

export function isSupabaseConfigured() {
  return Boolean(baseUrl() && apiKey());
}

async function supabaseFetch(path, body) {
  const url = `${baseUrl()}${path}`;
  const key = apiKey();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

/**
 * Send email OTP. Uses Supabase Auth — email arrives from your project (set From name to "Bambi Chat").
 */
export async function sendEmailOtp(email, { createUser = false } = {}) {
  if (!isSupabaseConfigured()) {
    return {
      error: {
        code: 'SUPABASE_NOT_CONFIGURED',
        message:
          'Email OTP requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server .env',
      },
    };
  }

  const { ok, status, data } = await supabaseFetch('/auth/v1/otp', {
    email,
    create_user: createUser,
    // Hint for templates / audit; actual From name is dashboard SMTP setting
    data: {
      app_name: 'Bambi Chat',
    },
  });

  if (!ok) {
    const msg =
      data?.msg ||
      data?.error_description ||
      data?.error ||
      data?.message ||
      'Could not send OTP email';
    // Rate limit
    if (status === 429) {
      return {
        error: { code: 'RATE_LIMIT', message: 'Too many OTP requests. Wait a minute and try again.' },
      };
    }
    return { error: { code: 'OTP_SEND_FAILED', message: String(msg) } };
  }

  return {
    data: {
      email,
      expiresInSec: 600,
      message: 'OTP sent to your email',
    },
  };
}

/**
 * Verify 6-digit email OTP from Supabase.
 */
export async function verifyEmailOtp(email, token) {
  if (!isSupabaseConfigured()) {
    return {
      error: {
        code: 'SUPABASE_NOT_CONFIGURED',
        message:
          'Email OTP requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server .env',
      },
    };
  }

  const { ok, data } = await supabaseFetch('/auth/v1/verify', {
    email,
    token: String(token).trim(),
    type: 'email',
  });

  if (!ok) {
    const msg =
      data?.msg ||
      data?.error_description ||
      data?.error ||
      data?.message ||
      'Invalid or expired code';
    return { error: { code: 'OTP_INVALID', message: String(msg) } };
  }

  return {
    data: {
      email,
      supabaseUserId: data?.user?.id || data?.id || null,
      accessToken: data?.access_token || null,
      verified: true,
    },
  };
}
