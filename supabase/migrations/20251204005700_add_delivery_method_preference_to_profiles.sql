-- Add delivery_method_preference column to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS delivery_method_preference TEXT DEFAULT 'sms'
CHECK (delivery_method_preference IN ('sms', 'whatsapp'));