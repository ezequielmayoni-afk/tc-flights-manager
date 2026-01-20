-- Migration: Add notify_needs_manual_quote setting
-- Description: Add setting to enable/disable Slack notifications for packages requiring manual quote

ALTER TABLE notification_settings
ADD COLUMN IF NOT EXISTS notify_needs_manual_quote BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN notification_settings.notify_needs_manual_quote IS 'Notify when a package price changes by more than 5% and requires manual quote';
