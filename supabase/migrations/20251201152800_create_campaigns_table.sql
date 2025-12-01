-- Create campaigns table for discount campaigns
CREATE TABLE campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  code TEXT UNIQUE, -- Promo code users enter
  discount_type TEXT NOT NULL CHECK (discount_type IN ('fixed', 'percentage')),
  discount_value DECIMAL(10,2) NOT NULL, -- Amount for fixed, decimal (0.10) for percentage
  chargebee_coupon_id TEXT UNIQUE, -- ID of created Chargebee coupon
  is_active BOOLEAN DEFAULT TRUE,
  valid_from TIMESTAMP WITH TIME ZONE,
  valid_until TIMESTAMP WITH TIME ZONE,
  usage_limit INTEGER, -- Optional max uses
  used_count INTEGER DEFAULT 0,
  applicable_plans JSONB, -- Array of plan IDs, null means all plans
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

-- Create index on code for fast lookups
CREATE INDEX idx_campaigns_code ON campaigns(code) WHERE code IS NOT NULL;

-- Create index on is_active for active campaigns
CREATE INDEX idx_campaigns_active ON campaigns(is_active) WHERE is_active = true;