-- Optimize RLS policies by wrapping auth.uid() calls in SELECT statements
-- This prevents unnecessary re-evaluation for each row

-- Drop existing policies and recreate with optimized syntax

-- Profiles table
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;

CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT USING ((SELECT auth.uid()) = id);

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING ((SELECT auth.uid()) = id);

CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = id);

-- User onboarding table
DROP POLICY IF EXISTS "Users can view their own onboarding" ON user_onboarding;
DROP POLICY IF EXISTS "Users can update their own onboarding" ON user_onboarding;
DROP POLICY IF EXISTS "Users can insert their own onboarding" ON user_onboarding;

CREATE POLICY "Users can view their own onboarding" ON user_onboarding
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update their own onboarding" ON user_onboarding
  FOR UPDATE USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert their own onboarding" ON user_onboarding
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

-- User loved ones countries table
DROP POLICY IF EXISTS "Users can view their own loved ones countries" ON user_loved_ones_countries;
DROP POLICY IF EXISTS "Users can manage their own loved ones countries" ON user_loved_ones_countries;

CREATE POLICY "Users can view their own loved ones countries" ON user_loved_ones_countries
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can manage their own loved ones countries" ON user_loved_ones_countries
  FOR ALL USING ((SELECT auth.uid()) = user_id);

-- User loved ones cities table
DROP POLICY IF EXISTS "Users can view their own loved ones cities" ON user_loved_ones_cities;
DROP POLICY IF EXISTS "Users can manage their own loved ones cities" ON user_loved_ones_cities;

CREATE POLICY "Users can view their own loved ones cities" ON user_loved_ones_cities
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can manage their own loved ones cities" ON user_loved_ones_cities
  FOR ALL USING ((SELECT auth.uid()) = user_id);

-- Subscriptions table
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON subscriptions;

CREATE POLICY "Users can view their own subscriptions" ON subscriptions
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

-- Dependents table
DROP POLICY IF EXISTS "Users can view their own dependents" ON dependents;
DROP POLICY IF EXISTS "Users can manage their own dependents" ON dependents;

CREATE POLICY "Users can view their own dependents" ON dependents
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can manage their own dependents" ON dependents
  FOR ALL USING ((SELECT auth.uid()) = user_id);

-- Admin users table
DROP POLICY IF EXISTS "Admins can view admin users" ON admin_users;
DROP POLICY IF EXISTS "Admins can manage admin users" ON admin_users;

CREATE POLICY "Admins can view admin users" ON admin_users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.user_id = (SELECT auth.uid()) AND au.is_active = true
    )
  );

CREATE POLICY "Admins can manage admin users" ON admin_users
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.user_id = (SELECT auth.uid()) AND au.is_active = true
    )
  );

-- Admin roles table
DROP POLICY IF EXISTS "Admins can view admin roles" ON admin_roles;
DROP POLICY IF EXISTS "Admins can manage admin roles" ON admin_roles;

CREATE POLICY "Admins can view admin roles" ON admin_roles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.user_id = (SELECT auth.uid()) AND au.is_active = true
    )
  );

CREATE POLICY "Admins can manage admin roles" ON admin_roles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.user_id = (SELECT auth.uid()) AND au.is_active = true
    )
  );

-- Plans table
DROP POLICY IF EXISTS "Anyone can view active plans" ON plans;
DROP POLICY IF EXISTS "Admins can manage plans" ON plans;

CREATE POLICY "Anyone can view active plans" ON plans
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage plans" ON plans
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.user_id = (SELECT auth.uid()) AND au.is_active = true
    )
  );

-- Audit logs table
DROP POLICY IF EXISTS "Admins can view audit logs" ON audit_logs;

CREATE POLICY "Admins can view audit logs" ON audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.user_id = (SELECT auth.uid()) AND au.is_active = true
    )
  );

-- Countries and cities remain public read
DROP POLICY IF EXISTS "Anyone can view countries" ON countries;
DROP POLICY IF EXISTS "Anyone can view cities" ON cities;

CREATE POLICY "Anyone can view countries" ON countries FOR SELECT USING (true);
CREATE POLICY "Anyone can view cities" ON cities FOR SELECT USING (true);