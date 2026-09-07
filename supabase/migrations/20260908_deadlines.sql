-- Vencimientos de 48 h para cotización manual y diseño.
--
-- Los relojes se arrancan con triggers, no desde la aplicación, por dos razones:
--   1. requote_status = 'needs_manual' lo escribe el cotizador-bot, que es un repo
--      externo. Desde acá no hay forma de engancharse a ese momento.
--   2. Un paquete entra a diseño por tres caminos distintos (bulk-action, el PATCH
--      de /api/packages/[id], y el pedido de creativos desde marketing). El trigger
--      los cubre a los tres sin repetir lógica en cada uno.

-- =====================================================
-- 1. Reloj de cotización manual
-- =====================================================

ALTER TABLE packages ADD COLUMN IF NOT EXISTS needs_manual_since TIMESTAMPTZ;

COMMENT ON COLUMN packages.needs_manual_since IS
  'Cuándo entró a revisión de cotización manual. El vencimiento se deriva sumando el SLA (48 h), no se materializa, para poder cambiar el SLA sin recalcular filas.';

CREATE OR REPLACE FUNCTION track_needs_manual_since()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.requote_status = 'needs_manual'
     AND (TG_OP = 'INSERT' OR OLD.requote_status IS DISTINCT FROM 'needs_manual') THEN
    NEW.needs_manual_since := COALESCE(NEW.needs_manual_since, NOW());
  ELSIF NEW.requote_status IS DISTINCT FROM 'needs_manual' THEN
    -- Salió del estado: se apaga el reloj para que no figure vencido nunca más.
    NEW.needs_manual_since := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_track_needs_manual_since ON packages;
CREATE TRIGGER trigger_track_needs_manual_since
  BEFORE INSERT OR UPDATE OF requote_status ON packages
  FOR EACH ROW EXECUTE FUNCTION track_needs_manual_since();

-- Backfill: los que ya están esperando revisión arrancan desde su última recotización.
UPDATE packages
   SET needs_manual_since = COALESCE(last_requote_at, updated_at, NOW())
 WHERE requote_status = 'needs_manual'
   AND needs_manual_since IS NULL;

CREATE INDEX IF NOT EXISTS idx_packages_needs_manual_since
  ON packages(needs_manual_since)
  WHERE requote_status = 'needs_manual';

-- =====================================================
-- 2. Reloj de diseño
-- =====================================================

-- design_deadline existía como DATE y se cargaba a mano. Con día entero, "48 h"
-- degenera en "pasado mañana", así que necesita hora.
ALTER TABLE packages
  ALTER COLUMN design_deadline TYPE TIMESTAMPTZ
  USING design_deadline::timestamptz;

COMMENT ON COLUMN packages.design_deadline IS
  'Vencimiento del pedido de diseño. Lo setea un trigger en +48 h al entrar a diseño; se puede editar a mano.';

CREATE OR REPLACE FUNCTION set_design_deadline()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo al ENTRAR a diseño y si no tenía deadline: un reenvío no pisa el reloj
  -- ni una fecha puesta a mano.
  IF NEW.send_to_design = true
     AND (TG_OP = 'INSERT' OR OLD.send_to_design IS DISTINCT FROM true)
     AND NEW.design_deadline IS NULL THEN
    NEW.design_deadline := NOW() + INTERVAL '48 hours';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_design_deadline ON packages;
CREATE TRIGGER trigger_set_design_deadline
  BEFORE INSERT OR UPDATE OF send_to_design ON packages
  FOR EACH ROW EXECUTE FUNCTION set_design_deadline();

CREATE INDEX IF NOT EXISTS idx_packages_design_deadline
  ON packages(design_deadline)
  WHERE send_to_design = true AND design_completed = false;

-- Los pedidos de creativos tienen su propio reloj: entran por marketing sin
-- tocar send_to_design, así que el trigger de arriba no los alcanza.
ALTER TABLE creative_requests ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION set_creative_request_deadline()
RETURNS TRIGGER AS $$
BEGIN
  NEW.deadline_at := COALESCE(NEW.deadline_at, NEW.created_at, NOW()) + INTERVAL '48 hours';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_creative_request_deadline ON creative_requests;
CREATE TRIGGER trigger_set_creative_request_deadline
  BEFORE INSERT ON creative_requests
  FOR EACH ROW EXECUTE FUNCTION set_creative_request_deadline();

UPDATE creative_requests
   SET deadline_at = created_at + INTERVAL '48 hours'
 WHERE deadline_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_creative_requests_deadline
  ON creative_requests(deadline_at)
  WHERE status IN ('pending', 'in_progress');

-- =====================================================
-- 3. Notificaciones
-- =====================================================

ALTER TABLE notification_settings
  ADD COLUMN IF NOT EXISTS notify_requote_deadline BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_design_deadline BOOLEAN DEFAULT TRUE;

-- La deduplicación de avisos filtra por tipo + fecha; hoy solo hay índice por tipo.
CREATE INDEX IF NOT EXISTS idx_notification_logs_type_created
  ON notification_logs(notification_type, created_at DESC);
