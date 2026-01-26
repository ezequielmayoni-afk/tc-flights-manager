-- Migration: Remove variant_number constraint to allow more than 5 variants
-- Purpose: Enable adding custom variants beyond the initial 5

-- Drop the existing constraint
ALTER TABLE ai_prompt_variants DROP CONSTRAINT IF EXISTS ai_prompt_variants_variant_number_check;

-- Add a new constraint that only requires variant_number >= 1
ALTER TABLE ai_prompt_variants ADD CONSTRAINT ai_prompt_variants_variant_number_check CHECK (variant_number >= 1);

COMMENT ON TABLE ai_prompt_variants IS 'Creative variants with scroll-stopping Si hooks - supports unlimited variants';
