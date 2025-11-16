-- Mirror phone verification status to public.profiles
-- Adds a column that we control instead of altering auth.users
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_phone_number_verified boolean NOT NULL DEFAULT false;