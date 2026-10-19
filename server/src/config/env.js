import dotenv from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

// Load root monorepo .env then server .env
const candidates = [
  resolve(process.cwd(), '../.env'),
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'),
];
for (const p of candidates) {
  if (existsSync(p)) dotenv.config({ path: p });
}
dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  resendApiKey: process.env.RESEND_API_KEY || '',
  resendFrom: process.env.RESEND_FROM || 'Bambi Chat <onboarding@resend.dev>',
  databaseUrl: process.env.DATABASE_URL || '',
  isDev: (process.env.NODE_ENV || 'development') === 'development',
  usePostgres: Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.includes('postgres')),
};

// OTP: set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
// Dashboard → Authentication → Providers → Email (enable)
// Dashboard → Project Settings → Auth → SMTP / Sender: name "Bambi Chat"
