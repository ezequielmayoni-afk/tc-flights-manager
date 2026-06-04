-- Adsets reservados sin ads — para que aparezcan en la vista marketing
-- con su nombre real (resolviéndolo desde Meta API) hasta que el user
-- cargue creativos y publique los ads.
ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS meta_reserved_adset_ids TEXT[] DEFAULT ARRAY[]::TEXT[];

COMMENT ON COLUMN packages.meta_reserved_adset_ids IS
  'Adsets reservados sin ads (workflow placeholder de marketing). Cuando un ad real existe en meta_ads para ese adset, este campo es informativo (no autoritario).';
