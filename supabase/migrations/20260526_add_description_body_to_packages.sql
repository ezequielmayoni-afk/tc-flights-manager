-- Agrega columna description_body para guardar el HTML/contenido del body del paquete
-- (itinerario, vuelos, incluye, no incluye, alojamientos) scraped desde
-- https://siviajo.com/es/idea/<tc_package_id>/<slug>

ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS description_body TEXT;

ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS description_body_fetched_at TIMESTAMPTZ;

COMMENT ON COLUMN packages.description_body IS 'HTML limpio del body del paquete extraído de la página pública de siviajo.com. Contiene itinerario día por día, vuelos, hoteles, incluye/no incluye, política de cancelación.';
COMMENT ON COLUMN packages.description_body_fetched_at IS 'Última vez que se scrapeó el body desde siviajo.com';
