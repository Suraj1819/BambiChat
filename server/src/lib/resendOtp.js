/**
 * Send OTP emails via Resend API (bypasses Supabase SMTP issues).
 * Env: RESEND_API_KEY, RESEND_FROM (e.g. "Bambi Chat <onboarding@resend.dev>")
 */

import { createHash, randomInt } from 'crypto';
import { env } from '../config/env.js';

/** email -> { codeHash, purpose, expiresAt, attempts } */
const otpStore = new Map();

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashCode(email, code) {
  return createHash('sha256')
    .update(`${normalizeEmail(email)}:${String(code).trim()}`)
    .digest('hex');
}

export function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY || env.resendApiKey);
}

function fromAddress() {
  return (
    process.env.RESEND_FROM ||
    env.resendFrom ||
    'Bambi Chat <onboarding@resend.dev>'
  );
}

function apiKey() {
  return process.env.RESEND_API_KEY || env.resendApiKey || '';
}

function otpEmailHtml(code) {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#0b141a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" style="background:#0b141a;padding:32px 16px;"><tr><td align="center">
<table width="100%" style="max-width:420px;background:#111b21;border-radius:16px;border:1px solid #233138;">
<tr><td style="padding:28px;text-align:center;">
<span style="display:inline-block;background:#00a884;color:#fff;font-weight:700;font-size:13px;padding:8px 14px;border-radius:999px;">Bambi Chat</span>
<h1 style="margin:16px 0 8px;color:#e9edef;font-size:22px;">Your verification code</h1>
<p style="margin:0;color:#8696a0;font-size:14px;">Use this code to sign in or create your account.</p>
<div style="margin:24px 0;background:#0b141a;border:1px solid #233138;border-radius:12px;padding:18px;">
<span style="font-family:ui-monospace,Menlo,Consolas,monospace;color:#00a884;font-size:32px;font-weight:700;letter-spacing:6px;">${code}</span>
</div>
<p style="margin:0;color:#8696a0;font-size:13px;">Tap / long-press the code to copy</p>
<p style="margin:8px 0 0;color:#667781;font-size:12px;">Expires in 10 minutes. Do not share this code.</p>
</td></tr></table>
<p style="margin:16px 0 0;color:#667781;font-size:11px;">Sent by Bambi Chat</p>
</td></tr></table></body></html>`;
}

/**
 * Generate OTP, store hash, email via Resend.
 */
export async function sendOtpViaResend(email, purpose = 'login') {
  if (!isResendConfigured()) {
    return {
      error: {
        code: 'RESEND_NOT_CONFIGURED',
        message: 'Set RESEND_API_KEY in server .env',
      },
    };
  }

  const em = normalizeEmail(email);
  const code = String(randomInt(100000, 999999));
  otpStore.set(em, {
    codeHash: hashCode(em, code),
    purpose,
    expiresAt: Date.now() + 10 * 60 * 1000,
    attempts: 0,
  });

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [em],
      subject: 'Bambi Chat — your verification code',
      html: otpEmailHtml(code),
      text: `Bambi Chat verification code: ${code}\nValid for 10 minutes.`,
    }),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    otpStore.delete(em);
    const msg =
      data?.message ||
      data?.error ||
      (typeof data === 'string' ? data : null) ||
      `Resend error ${res.status}`;
    return { error: { code: 'OTP_SEND_FAILED', message: String(msg) } };
  }

  return {
    data: {
      email: em,
      purpose,
      expiresInSec: 600,
      message: 'OTP sent to your email from Bambi Chat',
      provider: 'resend',
    },
  };
}

/**
 * Verify code sent via Resend.
 */
export function verifyOtpViaResend(email, code, purpose = 'login') {
  const em = normalizeEmail(email);
  const entry = otpStore.get(em);
  if (!entry || entry.purpose !== purpose) {
    return { error: { code: 'OTP_INVALID', message: 'Invalid or expired code' } };
  }
  if (entry.expiresAt < Date.now()) {
    otpStore.delete(em);
    return { error: { code: 'OTP_EXPIRED', message: 'Code expired. Request a new one.' } };
  }
  entry.attempts += 1;
  if (entry.attempts > 5) {
    otpStore.delete(em);
    return { error: { code: 'OTP_LOCKED', message: 'Too many attempts. Request a new code.' } };
  }
  if (entry.codeHash !== hashCode(em, code)) {
    return { error: { code: 'OTP_INVALID', message: 'Incorrect code' } };
  }
  otpStore.delete(em);
  return { data: { email: em, verified: true, provider: 'resend' } };
}
