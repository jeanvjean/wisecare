-- Add status column to dependents table with default 'inactive'
ALTER TABLE dependents ADD COLUMN status TEXT NOT NULL DEFAULT 'inactive';

-- Create index for efficient queries on status
CREATE INDEX idx_dependents_status ON dependents(status);

-- Create a database function to activate beneficiaries after 48 hours
CREATE OR REPLACE FUNCTION activate_expired_beneficiaries()
RETURNS INTEGER AS $$
DECLARE
    rows_affected INTEGER;
BEGIN
    UPDATE dependents 
    SET status = 'active',
        updated_at = NOW()
    WHERE status = 'inactive' 
    AND created_at <= NOW() - INTERVAL '48 hours';
    
    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    
    RETURN rows_affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;