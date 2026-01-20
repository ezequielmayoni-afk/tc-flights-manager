-- Migration: Fix profile default role
-- The role constraint was updated but the default value was not
-- Default 'user' is no longer valid - must be one of: admin, marketing, producto, diseño

-- ============================================
-- 1. Update the default role in profiles table
-- ============================================
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'producto';

-- ============================================
-- 2. Update any existing profiles with 'user' role
-- ============================================
UPDATE profiles SET role = 'producto' WHERE role = 'user';

-- ============================================
-- 3. Update the handle_new_user trigger function
--    to explicitly set a valid default role
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    'producto'  -- Default to most restricted role
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
