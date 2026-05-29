-- Agrega columna para trackear en qué campañas tiene ads el package (multi-campaign tracking).
-- Cuando duplicamos un ad a N campañas, registramos los campaign_ids acá para poder
-- mostrar "Este package está en X, Y, Z campañas" en /packages/marketing.

ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS meta_campaign_ids TEXT[] DEFAULT ARRAY[]::TEXT[];

COMMENT ON COLUMN packages.meta_campaign_ids IS
  'Array de IDs de Meta Campaigns donde el package tiene al menos un ad activo. Se actualiza al duplicar ads via /api/meta/ads/duplicate.';

-- Backfill: poblar desde meta_ads existentes (si la tabla meta_ads existe y tiene relación)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'meta_ads') THEN
    UPDATE packages p
    SET meta_campaign_ids = sub.campaigns
    FROM (
      SELECT package_id, ARRAY_AGG(DISTINCT campaign_id) FILTER (WHERE campaign_id IS NOT NULL) AS campaigns
      FROM meta_ads
      WHERE status != 'DELETED'
      GROUP BY package_id
    ) sub
    WHERE p.id = sub.package_id;
  END IF;
END $$;
