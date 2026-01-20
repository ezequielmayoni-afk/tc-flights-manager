-- Migration: Add RBAC policies for admin user management
-- Description: Allows admins to view, update and delete all profiles

-- ============================================
-- Helper function to check if current user is admin
-- ============================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Update profiles RLS policies
-- ============================================

-- Drop existing policies first
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- SELECT: Users can see their own profile OR admins can see all profiles
CREATE POLICY "Users can view own profile or admins all" ON profiles
  FOR SELECT USING (
    auth.uid() = id OR public.is_admin()
  );

-- UPDATE: Users can update their own profile OR admins can update any profile
CREATE POLICY "Users can update own profile or admins any" ON profiles
  FOR UPDATE USING (
    auth.uid() = id OR public.is_admin()
  );

-- DELETE: Only admins can delete profiles (except their own - handled in API)
CREATE POLICY "Admins can delete profiles" ON profiles
  FOR DELETE USING (
    public.is_admin() AND auth.uid() != id
  );

-- INSERT: Allow insert for the trigger (when user signs up)
-- This policy allows the system to create profiles on signup
CREATE POLICY "System can insert profiles" ON profiles
  FOR INSERT WITH CHECK (true);

-- ============================================
-- Comments
-- ============================================
COMMENT ON FUNCTION public.is_admin() IS 'Returns true if the current authenticated user has admin role';
