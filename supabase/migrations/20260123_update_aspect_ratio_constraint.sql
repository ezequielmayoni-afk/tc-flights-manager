-- Migration: Update aspect_ratio constraint to allow 4x5 and 9x16 formats
-- Purpose: Support new Instagram-optimized aspect ratios (4:5 for Feed, 9:16 for Stories)

-- Drop the old constraint
ALTER TABLE ai_generation_logs
DROP CONSTRAINT IF EXISTS ai_generation_logs_aspect_ratio_check;

-- Add new constraint with updated values
ALTER TABLE ai_generation_logs
ADD CONSTRAINT ai_generation_logs_aspect_ratio_check
CHECK (aspect_ratio IN ('1080', '1920', '4x5', '9x16'));

COMMENT ON COLUMN ai_generation_logs.aspect_ratio IS 'Image format: 4x5 (Feed 1080x1350), 9x16 (Stories 1080x1920), or legacy 1080/1920';
