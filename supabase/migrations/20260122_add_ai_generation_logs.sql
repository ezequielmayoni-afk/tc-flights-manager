-- Migration: Add ai_generation_logs table
-- Purpose: Track all AI generation requests for debugging and analysis

CREATE TABLE IF NOT EXISTS ai_generation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Package reference
  package_id INTEGER REFERENCES packages(id) ON DELETE SET NULL,
  tc_package_id INTEGER,

  -- Generation details
  variant INTEGER NOT NULL CHECK (variant >= 1 AND variant <= 5),
  aspect_ratio TEXT NOT NULL CHECK (aspect_ratio IN ('1080', '1920')),

  -- Request details
  prompt_used TEXT NOT NULL,
  model_used TEXT NOT NULL,
  package_data JSONB,
  assets_used JSONB, -- Which brand assets were included

  -- Response details
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'success', 'error')),
  response_raw JSONB,
  image_base64 TEXT, -- Temporary storage before Drive upload
  image_url TEXT, -- Final Google Drive URL
  image_file_id TEXT, -- Google Drive file ID
  error_message TEXT,
  error_details JSONB,

  -- Timing
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ai_generation_logs_package ON ai_generation_logs(tc_package_id);
CREATE INDEX IF NOT EXISTS idx_ai_generation_logs_status ON ai_generation_logs(status);
CREATE INDEX IF NOT EXISTS idx_ai_generation_logs_created ON ai_generation_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_generation_logs_variant ON ai_generation_logs(variant, aspect_ratio);

-- Add RLS policies
ALTER TABLE ai_generation_logs ENABLE ROW LEVEL SECURITY;

-- Allow read for authenticated users
CREATE POLICY "ai_generation_logs_read_policy" ON ai_generation_logs
  FOR SELECT TO authenticated USING (true);

-- Allow insert for authenticated users
CREATE POLICY "ai_generation_logs_insert_policy" ON ai_generation_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- Allow update for authenticated users (to update status)
CREATE POLICY "ai_generation_logs_update_policy" ON ai_generation_logs
  FOR UPDATE TO authenticated USING (true);

COMMENT ON TABLE ai_generation_logs IS 'Tracks all AI creative generation requests for debugging';
COMMENT ON COLUMN ai_generation_logs.prompt_used IS 'Full prompt sent to Gemini (for debugging)';
COMMENT ON COLUMN ai_generation_logs.assets_used IS 'JSON with keys of brand assets that were included';
COMMENT ON COLUMN ai_generation_logs.duration_ms IS 'Time taken for generation in milliseconds';
