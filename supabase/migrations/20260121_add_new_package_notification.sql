-- Migration: Add notify_new_package_imported setting
-- Description: Add setting to enable/disable Slack notifications when a new package is imported

ALTER TABLE notification_settings
ADD COLUMN IF NOT EXISTS notify_new_package_imported BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN notification_settings.notify_new_package_imported IS 'Notify when a new package is imported (requires SEO content)';
