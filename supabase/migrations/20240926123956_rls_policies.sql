-- RLS Policies for profiles table
CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- RLS Policies for user_onboarding table
CREATE POLICY "Users can view their own onboarding" ON user_onboarding
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own onboarding" ON user_onboarding
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own onboarding" ON user_onboarding
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for user_loved_ones_countries table
CREATE POLICY "Users can view their own loved ones countries" ON user_loved_ones_countries
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own loved ones countries" ON user_loved_ones_countries
  FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for user_loved_ones_cities table
CREATE POLICY "Users can view their own loved ones cities" ON user_loved_ones_cities
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own loved ones cities" ON user_loved_ones_cities
  FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for subscriptions table
CREATE POLICY "Users can view their own subscriptions" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Note: Admins can manage subscriptions - will be added when admin auth is set up

-- RLS Policies for dependents table
CREATE POLICY "Users can view their own dependents" ON dependents
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own dependents" ON dependents
  FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for admin_users table
-- Only admins can view admin users
CREATE POLICY "Admins can view admin users" ON admin_users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.user_id = auth.uid() AND au.is_active = true
    )
  );

CREATE POLICY "Admins can manage admin users" ON admin_users
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.user_id = auth.uid() AND au.is_active = true
    )
  );

-- RLS Policies for admin_roles table
CREATE POLICY "Admins can view admin roles" ON admin_roles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.user_id = auth.uid() AND au.is_active = true
    )
  );

CREATE POLICY "Admins can manage admin roles" ON admin_roles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.user_id = auth.uid() AND au.is_active = true
    )
  );

-- RLS Policies for plans table
-- Public read for active plans
CREATE POLICY "Anyone can view active plans" ON plans
  FOR SELECT USING (is_active = true);

-- Only admins can manage plans
CREATE POLICY "Admins can manage plans" ON plans
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.user_id = auth.uid() AND au.is_active = true
    )
  );

-- RLS Policies for audit_logs table
CREATE POLICY "Admins can view audit logs" ON audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.user_id = auth.uid() AND au.is_active = true
    )
  );

-- Countries and cities are public read
CREATE POLICY "Anyone can view countries" ON countries FOR SELECT USING (true);
CREATE POLICY "Anyone can view cities" ON cities FOR SELECT USING (true);

-- Insert default admin role
INSERT INTO admin_roles (name, permissions) VALUES
  ('Super Admin', '{"user:read": true, "user:write": true, "plan:read": true, "plan:write": true, "subscription:read": true, "subscription:write": true}'),
  ('Support', '{"user:read": true, "subscription:read": true}'),
  ('Billing', '{"subscription:read": true, "subscription:write": true}');