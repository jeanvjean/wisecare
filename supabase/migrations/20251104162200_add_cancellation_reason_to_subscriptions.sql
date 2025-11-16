-- Add cancellation_reason column to subscriptions table
ALTER TABLE subscriptions
ADD COLUMN cancellation_reason TEXT;

-- Add comment for documentation
COMMENT ON COLUMN subscriptions.cancellation_reason IS 'Reason provided by user when cancelling their subscription';