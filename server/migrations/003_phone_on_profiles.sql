-- Phone number for signup/login (unique when set)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_idx
  ON profiles (phone)
  WHERE phone IS NOT NULL AND phone <> '';
