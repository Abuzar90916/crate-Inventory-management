-- ============ Fix adjust_inventory WHERE clause using primary key ID ============

CREATE OR REPLACE FUNCTION public.adjust_inventory(
  _adjustment_type TEXT,
  _quantity INTEGER,
  _reason TEXT,
  _notes TEXT DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _inv_id UUID;
  _delta INTEGER;
  _total INTEGER;
  _outstanding INTEGER;
  _new_total INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;
  IF _adjustment_type NOT IN ('PURCHASE','DAMAGE','LOST','CORRECTION_ADD','CORRECTION_REMOVE') THEN
    RAISE EXCEPTION 'Invalid adjustment type';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) = 0 THEN RAISE EXCEPTION 'A reason is required'; END IF;

  INSERT INTO public.inventory (total_crates, updated_by) VALUES (0, auth.uid())
  ON CONFLICT (singleton) DO NOTHING;

  -- Select primary key id and total_crates for locking
  SELECT id, total_crates INTO _inv_id, _total 
    FROM public.inventory 
   WHERE singleton = true 
   LIMIT 1 
   FOR UPDATE;

  _delta := CASE WHEN _adjustment_type IN ('PURCHASE','CORRECTION_ADD') THEN _quantity ELSE -_quantity END;
  _new_total := _total + _delta;

  SELECT COALESCE(SUM(CASE WHEN transaction_type IN ('VEHICLE_OUT', 'PARTY_OUT', 'ISSUED') THEN quantity ELSE -quantity END), 0)
    INTO _outstanding FROM public.transactions;

  IF _new_total < 0 THEN RAISE EXCEPTION 'Total crates cannot go below zero'; END IF;
  IF _new_total < _outstanding THEN
    RAISE EXCEPTION 'Total crates cannot be lower than the % crates currently outstanding', _outstanding;
  END IF;

  -- Strict WHERE clause on primary key id to satisfy PostgreSQL safeupdate
  UPDATE public.inventory
     SET total_crates = _new_total, updated_by = auth.uid(), updated_at = now()
   WHERE id = _inv_id;

  INSERT INTO public.inventory_adjustments (adjustment_type, quantity, reason, notes, created_by)
  VALUES (_adjustment_type, _quantity, _reason, _notes, auth.uid());

  RETURN json_build_object('total_crates', _new_total, 'outstanding', _outstanding, 'available', _new_total - _outstanding);
END;
$$;
GRANT EXECUTE ON FUNCTION public.adjust_inventory(TEXT, INTEGER, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_inventory(TEXT, INTEGER, TEXT, TEXT) TO service_role;

-- Safety policies for inventory and adjustments
GRANT ALL ON public.inventory TO authenticated;
GRANT ALL ON public.inventory_adjustments TO authenticated;

DROP POLICY IF EXISTS "Inventory updatable" ON public.inventory;
CREATE POLICY "Inventory updatable" ON public.inventory FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Adjustments insertable" ON public.inventory_adjustments;
CREATE POLICY "Adjustments insertable" ON public.inventory_adjustments FOR INSERT TO authenticated WITH CHECK (true);

-- Vehicle deactivate/delete helper
CREATE OR REPLACE FUNCTION public.delete_vehicle(_vehicle_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.transactions WHERE vehicle_id = _vehicle_id) THEN
    UPDATE public.vehicles SET status = 'inactive' WHERE id = _vehicle_id;
    RETURN json_build_object('action', 'deactivated');
  END IF;
  DELETE FROM public.vehicles WHERE id = _vehicle_id;
  RETURN json_build_object('action', 'deleted');
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_vehicle(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_vehicle(UUID) TO service_role;