-- Migration: Add atomic functions for data integrity
-- Phase 2: Data Integrity improvements

-- =====================================================
-- 2.1: Atomic Inventory Update Function
-- Prevents race conditions when multiple webhooks update the same inventory
-- =====================================================

CREATE OR REPLACE FUNCTION update_inventory_atomic(
  p_flight_id INTEGER,
  p_passengers_delta INTEGER
)
RETURNS TABLE (
  sold_out BOOLEAN,
  remaining INTEGER,
  new_sold INTEGER,
  quantity INTEGER,
  tc_transport_id TEXT
) AS $$
DECLARE
  v_modality_id INTEGER;
  v_inventory_id INTEGER;
  v_quantity INTEGER;
  v_old_sold INTEGER;
  v_new_sold INTEGER;
  v_remaining INTEGER;
  v_tc_transport_id TEXT;
  v_flight_active BOOLEAN;
BEGIN
  -- Get flight info
  SELECT f.tc_transport_id, f.active
  INTO v_tc_transport_id, v_flight_active
  FROM flights f
  WHERE f.id = p_flight_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0, 0, 0, NULL::TEXT;
    RETURN;
  END IF;

  -- Get modality and inventory (with lock to prevent concurrent updates)
  SELECT m.id, mi.id, mi.quantity, mi.sold
  INTO v_modality_id, v_inventory_id, v_quantity, v_old_sold
  FROM modalities m
  JOIN modality_inventories mi ON mi.modality_id = m.id
  WHERE m.flight_id = p_flight_id
  LIMIT 1
  FOR UPDATE OF mi;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0, 0, 0, v_tc_transport_id;
    RETURN;
  END IF;

  -- Calculate new sold (atomic update)
  v_new_sold := GREATEST(0, COALESCE(v_old_sold, 0) + p_passengers_delta);
  v_remaining := GREATEST(0, COALESCE(v_quantity, 0) - v_new_sold);

  -- Update inventory atomically
  UPDATE modality_inventories
  SET sold = v_new_sold
  WHERE id = v_inventory_id;

  -- Return results
  RETURN QUERY SELECT
    (v_remaining = 0) AS sold_out,
    v_remaining AS remaining,
    v_new_sold AS new_sold,
    COALESCE(v_quantity, 0) AS quantity,
    v_tc_transport_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 2.2: Transactional Flight Creation Function
-- Creates flight with segments and modality in a single transaction
-- =====================================================

CREATE OR REPLACE FUNCTION create_flight_with_relations(
  p_flight_data JSONB,
  p_segments JSONB,
  p_modality JSONB,
  p_inventories JSONB
)
RETURNS TABLE (
  flight_id INTEGER,
  modality_id INTEGER,
  segments_created INTEGER,
  inventories_created INTEGER,
  success BOOLEAN,
  error_message TEXT
) AS $$
DECLARE
  v_flight_id INTEGER;
  v_modality_id INTEGER;
  v_segments_count INTEGER := 0;
  v_inventories_count INTEGER := 0;
  v_segment JSONB;
  v_inventory JSONB;
BEGIN
  -- Start transaction (already in a transaction by default)

  -- 1. Insert flight
  INSERT INTO flights (
    base_id, tc_transport_id, name, airline_code, transport_type,
    active, price_per_pax, currency,
    base_adult_price, base_children_price, base_infant_price,
    base_adult_rt_price, base_children_rt_price, base_infant_rt_price,
    adult_taxes_amount, children_taxes_amount, infant_taxes_amount,
    adult_rt_taxes_amount, children_rt_taxes_amount, infant_rt_taxes_amount,
    start_date, end_date, operational_days, product_types,
    allow_ow_price, allow_rt_price, release_contract,
    min_child_age, max_child_age, min_infant_age, max_infant_age,
    supplier_id, created_by, sync_status, last_sync_at
  )
  VALUES (
    p_flight_data->>'base_id',
    p_flight_data->>'tc_transport_id',
    p_flight_data->>'name',
    COALESCE(p_flight_data->>'airline_code', ''),
    p_flight_data->>'transport_type',
    COALESCE((p_flight_data->>'active')::boolean, true),
    COALESCE((p_flight_data->>'price_per_pax')::boolean, true),
    COALESCE(p_flight_data->>'currency', 'USD'),
    COALESCE((p_flight_data->>'base_adult_price')::numeric, 0),
    COALESCE((p_flight_data->>'base_children_price')::numeric, 0),
    COALESCE((p_flight_data->>'base_infant_price')::numeric, 0),
    COALESCE((p_flight_data->>'base_adult_rt_price')::numeric, 0),
    COALESCE((p_flight_data->>'base_children_rt_price')::numeric, 0),
    COALESCE((p_flight_data->>'base_infant_rt_price')::numeric, 0),
    COALESCE((p_flight_data->>'adult_taxes_amount')::numeric, 0),
    COALESCE((p_flight_data->>'children_taxes_amount')::numeric, 0),
    COALESCE((p_flight_data->>'infant_taxes_amount')::numeric, 0),
    COALESCE((p_flight_data->>'adult_rt_taxes_amount')::numeric, 0),
    COALESCE((p_flight_data->>'children_rt_taxes_amount')::numeric, 0),
    COALESCE((p_flight_data->>'infant_rt_taxes_amount')::numeric, 0),
    (p_flight_data->>'start_date')::date,
    (p_flight_data->>'end_date')::date,
    COALESCE((p_flight_data->'operational_days')::jsonb, '[]'::jsonb),
    COALESCE((p_flight_data->'product_types')::jsonb, '[]'::jsonb),
    COALESCE((p_flight_data->>'allow_ow_price')::boolean, true),
    COALESCE((p_flight_data->>'allow_rt_price')::boolean, true),
    COALESCE((p_flight_data->>'release_contract')::integer, 0),
    COALESCE((p_flight_data->>'min_child_age')::integer, 2),
    COALESCE((p_flight_data->>'max_child_age')::integer, 11),
    COALESCE((p_flight_data->>'min_infant_age')::integer, 0),
    COALESCE((p_flight_data->>'max_infant_age')::integer, 1),
    (p_flight_data->>'supplier_id')::integer,
    p_flight_data->>'created_by',
    'synced',
    NOW()
  )
  RETURNING id INTO v_flight_id;

  -- 2. Insert segments
  IF p_segments IS NOT NULL AND jsonb_array_length(p_segments) > 0 THEN
    FOR v_segment IN SELECT * FROM jsonb_array_elements(p_segments)
    LOOP
      INSERT INTO flight_segments (
        flight_id, departure_location_code, arrival_location_code,
        departure_time, arrival_time, plus_days, duration_time,
        model, num_service, sort_order
      )
      VALUES (
        v_flight_id,
        v_segment->>'departure_location_code',
        v_segment->>'arrival_location_code',
        v_segment->>'departure_time',
        v_segment->>'arrival_time',
        COALESCE((v_segment->>'plus_days')::integer, 0),
        v_segment->>'duration_time',
        COALESCE(v_segment->>'model', ''),
        COALESCE(v_segment->>'num_service', ''),
        COALESCE((v_segment->>'sort_order')::integer, 0)
      );
      v_segments_count := v_segments_count + 1;
    END LOOP;
  END IF;

  -- 3. Insert modality
  IF p_modality IS NOT NULL THEN
    INSERT INTO modalities (
      flight_id, code, active, cabin_class_type,
      baggage_allowance, baggage_allowance_type,
      min_passengers, max_passengers, on_request
    )
    VALUES (
      v_flight_id,
      p_modality->>'code',
      COALESCE((p_modality->>'active')::boolean, true),
      COALESCE(p_modality->>'cabin_class_type', 'ECONOMY'),
      COALESCE(p_modality->>'baggage_allowance', '0'),
      COALESCE(p_modality->>'baggage_allowance_type', 'KG'),
      COALESCE((p_modality->>'min_passengers')::integer, 1),
      COALESCE((p_modality->>'max_passengers')::integer, 9),
      COALESCE((p_modality->>'on_request')::boolean, false)
    )
    RETURNING id INTO v_modality_id;

    -- 4. Insert inventories
    IF p_inventories IS NOT NULL AND jsonb_array_length(p_inventories) > 0 THEN
      FOR v_inventory IN SELECT * FROM jsonb_array_elements(p_inventories)
      LOOP
        INSERT INTO modality_inventories (
          modality_id, start_date, end_date, quantity, sold
        )
        VALUES (
          v_modality_id,
          (v_inventory->>'start_date')::date,
          (v_inventory->>'end_date')::date,
          COALESCE((v_inventory->>'quantity')::integer, 0),
          0
        );
        v_inventories_count := v_inventories_count + 1;
      END LOOP;
    END IF;
  END IF;

  -- Return success
  RETURN QUERY SELECT
    v_flight_id,
    v_modality_id,
    v_segments_count,
    v_inventories_count,
    TRUE,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  -- Return error (transaction will be rolled back)
  RETURN QUERY SELECT
    NULL::INTEGER,
    NULL::INTEGER,
    0,
    0,
    FALSE,
    SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 2.3: Price Validation Function
-- Validates price against expected range
-- =====================================================

CREATE OR REPLACE FUNCTION validate_price_range(
  p_price DECIMAL,
  p_expected_price DECIMAL,
  p_tolerance_percent DECIMAL DEFAULT 10
)
RETURNS TABLE (
  is_valid BOOLEAN,
  price_diff DECIMAL,
  percent_diff DECIMAL
) AS $$
DECLARE
  v_diff DECIMAL;
  v_percent DECIMAL;
BEGIN
  v_diff := ABS(p_price - p_expected_price);
  v_percent := CASE
    WHEN p_expected_price > 0 THEN (v_diff / p_expected_price) * 100
    ELSE 0
  END;

  RETURN QUERY SELECT
    (v_percent <= p_tolerance_percent) AS is_valid,
    v_diff AS price_diff,
    v_percent AS percent_diff;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION update_inventory_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION update_inventory_atomic TO service_role;
GRANT EXECUTE ON FUNCTION create_flight_with_relations TO authenticated;
GRANT EXECUTE ON FUNCTION create_flight_with_relations TO service_role;
GRANT EXECUTE ON FUNCTION validate_price_range TO authenticated;
GRANT EXECUTE ON FUNCTION validate_price_range TO service_role;
