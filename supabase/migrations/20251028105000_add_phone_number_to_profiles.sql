-- Add phone_number column to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS phone_number TEXT;

-- Add phone_number_verified column to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS phone_number_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Create index for phone_number for faster lookups
CREATE INDEX IF NOT EXISTS profiles_phone_number_idx ON public.profiles (phone_number);

-- Migrate existing phone data from auth.users metadata to profiles
-- This updates profiles with phone data from user metadata for users who have verified phones
UPDATE public.profiles
SET
  phone_number = COALESCE(profiles.phone_number, (auth.users.raw_user_meta_data->>'phone_number')),
  phone_number_verified = COALESCE((auth.users.raw_user_meta_data->>'is_phone_number_verified')::boolean, profiles.phone_number_verified)
FROM auth.users
WHERE profiles.id = auth.users.id
  AND (
    profiles.phone_number IS NULL
    OR profiles.phone_number_verified = FALSE
  )
  AND (
    (auth.users.raw_user_meta_data->>'phone_number') IS NOT NULL
    OR (auth.users.raw_user_meta_data->>'is_phone_number_verified')::boolean = TRUE
  );

-- Optional: Migrate existing phone data from auth.users metadata to profiles
-- This would require a one-time script to populate the new columns
-- For now, we'll leave this as a manual migration step