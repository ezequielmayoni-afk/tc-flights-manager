-- Migration: Creative Workflow & Slack Notifications
-- Description: Add creative update tracking, requests system, and Slack notifications

-- ============================================
-- 1. ADD CREATIVE TRACKING FIELDS TO PACKAGES
-- ============================================

-- Track if creatives need updating (price changed, etc.)
ALTER TABLE packages ADD COLUMN IF NOT EXISTS creative_update_needed BOOLEAN DEFAULT FALSE;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS creative_update_reason TEXT;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS creative_update_requested_at TIMESTAMPTZ;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS creative_update_requested_by TEXT;

-- Snapshot of price when creatives were last created/updated
ALTER TABLE packages ADD COLUMN IF NOT EXISTS price_at_creative_creation DECIMAL(12,2);
ALTER TABLE packages ADD COLUMN IF NOT EXISTS creatives_last_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_packages_creative_update_needed
ON packages(creative_update_needed) WHERE creative_update_needed = true;

-- ============================================
-- 2. CREATIVE REQUESTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS creative_requests (
  id SERIAL PRIMARY KEY,
  package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  tc_package_id INTEGER NOT NULL,

  -- Request details
  requested_by TEXT NOT NULL,
  reason TEXT NOT NULL, -- 'price_change', 'low_performance', 'new_variant', 'update_content', 'other'
  reason_detail TEXT,

  -- What needs to be updated
  variant INTEGER, -- null = all variants
  aspect_ratio VARCHAR(4), -- null = all formats, '4x5' or '9x16'

  -- Priority
  priority VARCHAR(10) DEFAULT 'normal' CHECK (priority IN ('urgent', 'normal', 'low')),

  -- Status workflow
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected', 'cancelled')),

  -- Design response
  assigned_to TEXT,
  notes TEXT,
  rejection_reason TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Slack notification tracking
  slack_notified_at TIMESTAMPTZ,
  slack_message_ts TEXT -- Slack message ID for threading
);

CREATE INDEX IF NOT EXISTS idx_creative_requests_package ON creative_requests(package_id);
CREATE INDEX IF NOT EXISTS idx_creative_requests_status ON creative_requests(status);
CREATE INDEX IF NOT EXISTS idx_creative_requests_priority ON creative_requests(priority, created_at DESC);

-- ============================================
-- 3. NOTIFICATION SETTINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS notification_settings (
  id SERIAL PRIMARY KEY,

  -- Slack configuration
  slack_webhook_url TEXT,
  slack_channel_design TEXT DEFAULT '#design',
  slack_channel_marketing TEXT DEFAULT '#marketing',
  slack_enabled BOOLEAN DEFAULT FALSE,

  -- Email configuration (future)
  email_enabled BOOLEAN DEFAULT FALSE,
  email_design TEXT,
  email_marketing TEXT,

  -- Notification triggers
  notify_price_change BOOLEAN DEFAULT TRUE,
  notify_creative_request BOOLEAN DEFAULT TRUE,
  notify_creative_completed BOOLEAN DEFAULT TRUE,
  notify_ad_underperforming BOOLEAN DEFAULT TRUE,

  -- Thresholds
  price_change_threshold_pct DECIMAL(5,2) DEFAULT 5.0, -- Notify if price changes by more than 5%
  ctr_threshold_pct DECIMAL(5,2) DEFAULT 0.5, -- Notify if CTR below 0.5%
  cpl_threshold DECIMAL(12,2) DEFAULT 10.0, -- Notify if CPL above $10

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO notification_settings (id, slack_enabled)
VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 4. NOTIFICATION LOG TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS notification_logs (
  id SERIAL PRIMARY KEY,

  notification_type VARCHAR(50) NOT NULL, -- 'price_change', 'creative_request', 'creative_completed', 'ad_underperforming'
  channel VARCHAR(20) NOT NULL, -- 'slack', 'email'
  recipient TEXT NOT NULL, -- channel name or email

  -- Reference
  package_id INTEGER REFERENCES packages(id) ON DELETE SET NULL,
  creative_request_id INTEGER REFERENCES creative_requests(id) ON DELETE SET NULL,
  meta_ad_id VARCHAR(50),

  -- Message
  message_title TEXT NOT NULL,
  message_body TEXT,
  message_data JSONB,

  -- Status
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'sent', 'failed'
  error_message TEXT,

  -- Slack specific
  slack_message_ts TEXT,
  slack_thread_ts TEXT,

  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_type ON notification_logs(notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON notification_logs(status);
CREATE INDEX IF NOT EXISTS idx_notification_logs_package ON notification_logs(package_id);

-- ============================================
-- 5. COMMENTS
-- ============================================
COMMENT ON COLUMN packages.creative_update_needed IS 'Flag indicating creatives need to be updated (price change, etc.)';
COMMENT ON COLUMN packages.price_at_creative_creation IS 'Snapshot of price when creatives were created, for comparison';

COMMENT ON TABLE creative_requests IS 'Requests from marketing to design for new/updated creatives';
COMMENT ON TABLE notification_settings IS 'Configuration for Slack and email notifications';
COMMENT ON TABLE notification_logs IS 'Log of all notifications sent';
