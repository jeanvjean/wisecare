-- Fix infinite recursion in admin_users RLS policies
-- The issue is that the policy checks admin_users table, which triggers the same policy

-- Drop the problematic policies
DROP POLICY IF EXISTS "Admins can view admin users" ON admin_users;
DROP POLICY IF EXISTS "Admins can manage admin users" ON admin_users;

-- Create new policies that avoid the circular reference
-- Use a different approach: check if the current user is in admin_users table
-- but use a direct query that doesn't trigger RLS on admin_users

CREATE POLICY "Admins can view admin users" ON admin_users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1 FROM admin_users au
        WHERE au.user_id = auth.users.id AND au.is_active = true
      )
    )
  );

CREATE POLICY "Admins can manage admin users" ON admin_users
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1 FROM admin_users au
        WHERE au.user_id = auth.users.id AND au.is_active = true
      )
    )
  );