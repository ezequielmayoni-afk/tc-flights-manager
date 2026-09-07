-- system_logs existía desde 006 pero nunca se usó: solo tenía campos para
-- vuelos. Se extiende para poder registrar cualquier entidad (paquetes,
-- creativos, cupos) y saber quién disparó cada acción.

ALTER TABLE system_logs ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE system_logs ADD COLUMN IF NOT EXISTS entity_id INTEGER;
ALTER TABLE system_logs ADD COLUMN IF NOT EXISTS entity_label TEXT;
ALTER TABLE system_logs ADD COLUMN IF NOT EXISTS actor_email TEXT;
ALTER TABLE system_logs ADD COLUMN IF NOT EXISTS duration_ms INTEGER;

CREATE INDEX IF NOT EXISTS idx_system_logs_entity ON system_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_action ON system_logs(action, created_at DESC);
