-- Pedido de cupos con varios sondeos, cada uno con su configuración (2026-10-19).
-- Ej.: enero, 5 fechas de 7 noches + 8 fechas de 9 noches; aerolínea y directo por sondeo. Idempotente.
ALTER TABLE cupo_requests ADD COLUMN IF NOT EXISTS probe_groups JSONB NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN cupo_requests.probe_groups IS 'Sondeos del pedido: [{months[], nights, count, weekdays[], airlinePref[], directOnly, seats}]. Vacío = pedido viejo de un solo sondeo (months/nights/weekdays del pedido).';
ALTER TABLE cupo_request_options ADD COLUMN IF NOT EXISTS probe_group INTEGER;
ALTER TABLE cupo_request_options ADD COLUMN IF NOT EXISTS probe_group_label TEXT;
-- La misma fecha y vuelo puede pedirse con dos duraciones distintas (7 y 9 noches).
ALTER TABLE cupo_request_options DROP CONSTRAINT IF EXISTS cupo_request_options_request_id_departure_date_airline_code_key;
ALTER TABLE cupo_request_options DROP CONSTRAINT IF EXISTS cupo_request_options_unique_tirada;
ALTER TABLE cupo_request_options ADD CONSTRAINT cupo_request_options_unique_tirada UNIQUE (request_id, departure_date, nights, airline_code, flight_out);
