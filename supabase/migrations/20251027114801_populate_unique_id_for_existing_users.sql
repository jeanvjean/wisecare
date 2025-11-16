-- Populate unique_id for existing users where it is NULL
UPDATE public.profiles
SET unique_id = nextval('public.user_unique_id_seq')
WHERE unique_id IS NULL;

-- Optional: Update auth.users metadata for existing users
-- This requires a function to iterate through profiles and update auth.users
-- This is more complex and might be better handled by a one-off script or a trigger
-- For simplicity, we'll leave this out of the migration for now, as the primary
-- goal is to ensure the profiles table has the unique_id.