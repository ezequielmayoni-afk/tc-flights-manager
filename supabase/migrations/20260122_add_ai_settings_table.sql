-- Create ai_settings table for storing AI configuration
CREATE TABLE IF NOT EXISTS ai_settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(255) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on key
CREATE INDEX IF NOT EXISTS idx_ai_settings_key ON ai_settings(key);

-- Add comment
COMMENT ON TABLE ai_settings IS 'Stores AI configuration settings like prompts';
