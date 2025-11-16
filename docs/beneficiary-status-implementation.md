# Beneficiary Status Implementation

This document outlines the implementation of the beneficiary status feature where beneficiaries are created as `inactive` by default and automatically change to `active` after 48 hours.

## Changes Made

### 1. Database Migration
**File:** `supabase/migrations/20251116165300_add_status_to_dependents.sql`

- Added `status` column to the `dependents` table with default value `'inactive'`
- Created database index `idx_dependents_status` for efficient querying
- Created PostgreSQL function `activate_expired_beneficiaries()` that:
  - Updates beneficiaries from `inactive` to `active` status
  - Only affects beneficiaries created more than 48 hours ago
  - Returns the count of activated beneficiaries
  - Updates the `updated_at` timestamp

### 2. Updated Add Beneficiary Function
**File:** `supabase/functions/add-beneficiary/index.ts`

- Modified the payload in the add-beneficiary function to include `status: 'inactive'`
- All new beneficiaries will now default to inactive status

### 3. Scheduled Activation Function
**File:** `supabase/functions/activate-beneficiaries/index.ts`

- Created new edge function to periodically activate beneficiaries
- Calls the database function `activate_expired_beneficiaries()` 
- Returns success response with count of activated beneficiaries
- Handles errors gracefully

### 4. Scheduled Job Configuration
The activation function can be scheduled using one of these methods:

**Option 1: Supabase Dashboard**
- Go to Supabase Dashboard → Edge Functions → activate-beneficiaries
- Set up a cron trigger to run every hour

**Option 2: External Cron Service**
- Use services like cron-job.org, EasyCron, or similar
- Configure to call the function URL every hour

**Option 3: Manual Execution**
- The function can be called manually via API when needed
- Useful for testing or one-time activation

## How It Works

1. **Add Beneficiary**: When a user adds a beneficiary via the `add-beneficiary` function, the beneficiary is created with `status = 'inactive'`

2. **Automatic Activation**: The `activate-beneficiaries` function runs hourly and:
   - Checks for beneficiaries with `status = 'inactive'` 
   - Identifies those created more than 48 hours ago
   - Updates their status to `'active'`
   - Updates the `updated_at` timestamp

3. **Monitoring**: The function logs the number of beneficiaries activated and returns this count in the response

## Database Schema Changes

```sql
ALTER TABLE dependents ADD COLUMN status TEXT NOT NULL DEFAULT 'inactive';
CREATE INDEX idx_dependents_status ON dependents(status);

CREATE OR REPLACE FUNCTION activate_expired_beneficiaries()
RETURNS INTEGER AS $$
-- Function implementation (see migration file)
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## API Endpoints

### Add Beneficiary (Updated)
- **URL**: `/functions/v1/add-beneficiary`
- **Method**: POST
- **Behavior**: Creates beneficiary with `status = 'inactive'`

### Activate Beneficiaries (New)
- **URL**: `/functions/v1/activate-beneficiaries`
- **Method**: GET/POST
- **Behavior**: Runs the activation process manually (useful for testing)
- **Schedule**: Automatically runs every hour when deployed

## Testing

To test the implementation:

1. **Database Test**: Run `SELECT activate_expired_beneficiaries();` to test the database function directly
2. **Function Test**: Call the `activate-beneficiaries` function manually
3. **Integration Test**: Add a new beneficiary and verify it's created with `status = 'inactive'`

## Deployment Notes

- The migration needs to be applied to the database
- The `activate-beneficiaries` function needs to be deployed
- The cron schedule will only take effect when the function is deployed to Supabase Edge Functions

## Security Considerations

- The database function uses `SECURITY DEFINER` to ensure it runs with elevated privileges
- The scheduled function does not require JWT verification since it's triggered by the cron system
- All existing RLS policies continue to apply to the dependents table