-- Add email for OTP-based accounts (safe if already exists)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_lower_idx
  ON profiles (lower(email))
  WHERE email IS NOT NULL AND email <> '';
