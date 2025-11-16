-- Create a sequence for unique_id, ensuring it generates 9-digit numbers
CREATE SEQUENCE IF NOT EXISTS public.user_unique_id_seq
    MINVALUE 100000000
    MAXVALUE 999999999
    START WITH 100000000
    INCREMENT BY 1
    CYCLE; -- CYCLE allows the sequence to wrap around if it reaches MAXVALUE

-- Add unique_id column to profiles table
ALTER TABLE public.profiles
ADD COLUMN unique_id BIGINT NOT NULL DEFAULT nextval('public.user_unique_id_seq');

-- Add a unique constraint to the unique_id column
CREATE UNIQUE INDEX profiles_unique_id_key ON public.profiles (unique_id);

-- Set the sequence owner to the unique_id column
ALTER SEQUENCE public.user_unique_id_seq OWNED BY public.profiles.unique_id;

-- Optional: Create a function to generate a random starting value for the sequence
-- This helps to avoid predictable IDs and potential collisions if you ever reset the sequence
CREATE OR REPLACE FUNCTION public.set_user_unique_id_seq_start()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.unique_id IS NULL THEN
    NEW.unique_id := nextval('public.user_unique_id_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Optional: Apply the function as a BEFORE INSERT trigger
-- This ensures that if unique_id is not provided, it gets a value from the sequence
CREATE TRIGGER set_user_unique_id_trigger
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_user_unique_id_seq_start();