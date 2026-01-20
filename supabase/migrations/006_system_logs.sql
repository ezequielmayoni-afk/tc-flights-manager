-- TC Flights Manager - System Logs
-- Run this in your Supabase SQL Editor

-- =====================================================
-- SYSTEM_LOGS (error and activity tracking)
-- =====================================================
CREATE TABLE system_logs (
  id SERIAL PRIMARY KEY,

  -- Log level: error, warning, info, debug
  level TEXT NOT NULL DEFAULT 'error' CHECK (level IN ('error', 'warning', 'info', 'debug')),

  -- Source of the log (e.g., 'tc-sync', 'api', 'import')
  source TEXT NOT NULL,

  -- Action being performed (e.g., 'create-transport', 'sync-flight', 'delete-flight')
  action TEXT,

  -- Short message describing the log
  message TEXT NOT NULL,

  -- Detailed error/info (stack trace, response body, etc.)
  details JSONB,

  -- Related entity info
  flight_id INTEGER REFERENCES flights(id) ON DELETE SET NULL,
  tc_transport_id TEXT,

  -- User who triggered the action (if applicable)
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Request/Response data for API calls
  request_data JSONB,
  response_data JSONB,

  -- HTTP status code (for API errors)
  status_code INTEGER,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX idx_system_logs_level ON system_logs(level);
CREATE INDEX idx_system_logs_source ON system_logs(source);
CREATE INDEX idx_system_logs_created_at ON system_logs(created_at DESC);
CREATE INDEX idx_system_logs_flight_id ON system_logs(flight_id);

-- RLS Policies
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can view logs
CREATE POLICY "Authenticated users can view logs"
  ON system_logs FOR SELECT
  TO authenticated
  USING (true);

-- Only authenticated users can insert logs
CREATE POLICY "Authenticated users can insert logs"
  ON system_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Function to clean old logs (keep last 30 days)
CREATE OR REPLACE FUNCTION clean_old_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM system_logs
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
