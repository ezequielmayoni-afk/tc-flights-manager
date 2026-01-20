-- Migration: Add detailed baggage fields to modalities
-- Run this in your Supabase SQL Editor after 001_initial_schema.sql

-- Add new columns to modalities table for detailed baggage tracking
ALTER TABLE modalities
ADD COLUMN IF NOT EXISTS includes_backpack BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS carryon_weight INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS checked_bag_weight INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS checked_bags_quantity INTEGER DEFAULT 1;

-- Add comments for clarity
COMMENT ON COLUMN modalities.includes_backpack IS 'Whether a personal item/backpack is included';
COMMENT ON COLUMN modalities.carryon_weight IS 'Carry-on baggage weight allowance in KG';
COMMENT ON COLUMN modalities.checked_bag_weight IS 'Checked baggage weight allowance in KG';
COMMENT ON COLUMN modalities.checked_bags_quantity IS 'Number of checked bags allowed';

-- Update baggage_allowance_type to have clearer options
-- This will be computed from the individual fields when syncing to TC
COMMENT ON COLUMN modalities.baggage_allowance IS 'Computed baggage description for TC sync';
COMMENT ON COLUMN modalities.baggage_allowance_type IS 'KG or PC (pieces) for TC sync';
