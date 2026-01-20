-- Migration: Bulk send all packages to marketing
-- Description: Updates all packages to marketing status with their itineraries
-- Date: 2026-01-20

-- ============================================
-- 1. UPDATE ALL PACKAGES TO MARKETING STATUS
-- ============================================

-- First, let's see what we have
DO $$
DECLARE
  total_packages INTEGER;
  packages_with_destinations INTEGER;
  packages_with_hotels INTEGER;
  packages_with_transports INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_packages FROM packages;
  SELECT COUNT(DISTINCT package_id) INTO packages_with_destinations FROM package_destinations;
  SELECT COUNT(DISTINCT package_id) INTO packages_with_hotels FROM package_hotels;
  SELECT COUNT(DISTINCT package_id) INTO packages_with_transports FROM package_transports;

  RAISE NOTICE 'Total packages: %', total_packages;
  RAISE NOTICE 'Packages with destinations: %', packages_with_destinations;
  RAISE NOTICE 'Packages with hotels: %', packages_with_hotels;
  RAISE NOTICE 'Packages with transports: %', packages_with_transports;
END $$;

-- ============================================
-- 2. SET MARKETING STATUS FOR ALL PACKAGES
-- ============================================

-- Update all packages to marketing active status
UPDATE packages
SET
  marketing_status = 'active',
  send_to_marketing = true,
  marketing_started_at = COALESCE(marketing_started_at, NOW()),
  -- Also enable monitoring if not already
  monitor_enabled = true,
  -- Set requote status to pending if null
  requote_status = COALESCE(requote_status, 'pending'),
  -- Ensure status is appropriate
  status = CASE
    WHEN status = 'imported' THEN 'in_marketing'
    ELSE status
  END,
  updated_at = NOW()
WHERE
  -- Only update packages that have a valid price
  current_price_per_pax > 0
  -- And have at least some content
  AND title IS NOT NULL
  AND title != '';

-- ============================================
-- 3. VERIFY ITINERARY DATA EXISTS
-- ============================================

-- Log packages without destinations
DO $$
DECLARE
  missing_destinations INTEGER;
  missing_hotels INTEGER;
  missing_transports INTEGER;
BEGIN
  SELECT COUNT(*) INTO missing_destinations
  FROM packages p
  WHERE NOT EXISTS (SELECT 1 FROM package_destinations pd WHERE pd.package_id = p.id);

  SELECT COUNT(*) INTO missing_hotels
  FROM packages p
  WHERE NOT EXISTS (SELECT 1 FROM package_hotels ph WHERE ph.package_id = p.id);

  SELECT COUNT(*) INTO missing_transports
  FROM packages p
  WHERE NOT EXISTS (SELECT 1 FROM package_transports pt WHERE pt.package_id = p.id);

  RAISE NOTICE 'Packages missing destinations: %', missing_destinations;
  RAISE NOTICE 'Packages missing hotels: %', missing_hotels;
  RAISE NOTICE 'Packages missing transports: %', missing_transports;
END $$;

-- ============================================
-- 4. CREATE SUMMARY VIEW FOR MARKETING PACKAGES
-- ============================================

CREATE OR REPLACE VIEW marketing_packages_summary AS
SELECT
  p.id,
  p.tc_package_id,
  p.title,
  p.current_price_per_pax,
  p.currency,
  p.departure_date,
  p.nights_count,
  p.marketing_status,
  p.marketing_started_at,
  p.ads_created_count,
  p.ads_active_count,
  p.total_ad_spend,
  p.total_leads,
  -- Itinerary counts
  (SELECT COUNT(*) FROM package_destinations pd WHERE pd.package_id = p.id) as destinations_count,
  (SELECT COUNT(*) FROM package_hotels ph WHERE ph.package_id = p.id) as hotels_count,
  (SELECT COUNT(*) FROM package_transports pt WHERE pt.package_id = p.id) as transports_count,
  (SELECT COUNT(*) FROM package_transfers pf WHERE pf.package_id = p.id) as transfers_count,
  (SELECT COUNT(*) FROM package_tickets pk WHERE pk.package_id = p.id) as tickets_count,
  -- Creative counts
  (SELECT COUNT(*) FROM meta_creatives mc WHERE mc.package_id = p.id) as creatives_count,
  (SELECT COUNT(*) FROM meta_ad_copies mac WHERE mac.package_id = p.id) as ad_copies_count,
  (SELECT COUNT(*) FROM meta_ads ma WHERE ma.package_id = p.id) as ads_count
FROM packages p
WHERE p.marketing_status = 'active';

COMMENT ON VIEW marketing_packages_summary IS 'Summary view of all packages in marketing with itinerary and ad counts';

-- ============================================
-- 5. FINAL SUMMARY
-- ============================================

DO $$
DECLARE
  total_marketing INTEGER;
  total_with_full_itinerary INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_marketing
  FROM packages WHERE marketing_status = 'active';

  SELECT COUNT(*) INTO total_with_full_itinerary
  FROM packages p
  WHERE marketing_status = 'active'
    AND EXISTS (SELECT 1 FROM package_destinations pd WHERE pd.package_id = p.id)
    AND EXISTS (SELECT 1 FROM package_hotels ph WHERE ph.package_id = p.id);

  RAISE NOTICE '========================================';
  RAISE NOTICE 'MIGRATION COMPLETE';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Total packages in marketing: %', total_marketing;
  RAISE NOTICE 'Packages with full itinerary (dest + hotel): %', total_with_full_itinerary;
  RAISE NOTICE '========================================';
END $$;
