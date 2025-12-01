-- RLS Policies for campaigns table
-- Only admins can manage campaigns
CREATE POLICY "Admins can view campaigns" ON campaigns
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.user_id = auth.uid() AND au.is_active = true
    )
  );

CREATE POLICY "Admins can manage campaigns" ON campaigns
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.user_id = auth.uid() AND au.is_active = true
    )
  );

-- Public can validate promo codes (for checkout validation)
CREATE POLICY "Anyone can validate active campaigns" ON campaigns
  FOR SELECT USING (is_active = true AND code IS NOT NULL);