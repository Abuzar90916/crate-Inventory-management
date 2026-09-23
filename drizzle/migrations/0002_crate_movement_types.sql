-- ============ 0002: Crate Movement Types and Atomic IN/OUT Operations ============

-- 1. Update transactions check constraint to allow VEHICLE_IN, VEHICLE_OUT, PARTY_IN, PARTY_OUT
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_transaction_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_transaction_type_check 
  CHECK (transaction_type IN ('VEHICLE_IN', 'VEHICLE_OUT', 'PARTY_IN', 'PARTY_OUT', 'ISSUED', 'RETURNED'));

-- Allow authenticated users to insert transactions directly if needed
DROP POLICY IF EXISTS "Transactions insertable" ON public.transactions;
CREATE POLICY "Transactions insertable" ON public.transactions FOR INSERT TO authenticated WITH CHECK (true);

-- 2. Update vehicle_balances view
CREATE OR REPLACE VIEW public.vehicle_balances WITH (security_invoker = on) AS
SELECT v.id AS vehicle_id,
       v.vehicle_number,
       v.driver_name,
       v.driver_phone,
       v.status,
       COALESCE(SUM(CASE WHEN t.transaction_type IN ('VEHICLE_OUT', 'ISSUED') THEN t.quantity ELSE 0 END), 0)::int AS issued,
       COALESCE(SUM(CASE WHEN t.transaction_type IN ('VEHICLE_IN', 'RETURNED') THEN t.quantity ELSE 0 END), 0)::int AS returned,
       COALESCE(SUM(CASE WHEN t.transaction_type IN ('VEHICLE_OUT', 'ISSUED') THEN t.quantity ELSE -t.quantity END), 0)::int AS balance,
       COUNT(t.id)::int AS transaction_count,
       MAX(t.transaction_date) AS last_activity
FROM public.vehicles v
LEFT JOIN public.transactions t ON t.vehicle_id = v.id
GROUP BY v.id;
GRANT SELECT ON public.vehicle_balances TO authenticated;
GRANT ALL ON public.vehicle_balances TO service_role;

-- 3. Update party_balances view
CREATE OR REPLACE VIEW public.party_balances WITH (security_invoker = on) AS
SELECT p.id AS party_id,
       p.party_name,
       p.contact_person,
       p.phone,
       p.status,
       COALESCE(SUM(CASE WHEN t.transaction_type IN ('PARTY_OUT', 'ISSUED') THEN t.quantity ELSE 0 END), 0)::int AS issued,
       COALESCE(SUM(CASE WHEN t.transaction_type IN ('PARTY_IN', 'RETURNED') THEN t.quantity ELSE 0 END), 0)::int AS returned,
       COALESCE(SUM(CASE WHEN t.transaction_type IN ('PARTY_OUT', 'ISSUED') THEN t.quantity ELSE -t.quantity END), 0)::int AS balance,
       COUNT(t.id)::int AS transaction_count,
       MAX(t.transaction_date) AS last_activity
FROM public.parties p
LEFT JOIN public.transactions t ON t.party_id = p.id
GROUP BY p.id;
GRANT SELECT ON public.party_balances TO authenticated;
GRANT ALL ON public.party_balances TO service_role;

-- 4. Update dashboard_stats function
CREATE OR REPLACE FUNCTION public.dashboard_stats()
RETURNS JSON
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT json_build_object(
    'total_crates', COALESCE((SELECT total_crates FROM public.inventory LIMIT 1), 0),
    'with_vehicles', COALESCE((SELECT SUM(CASE WHEN transaction_type IN ('VEHICLE_OUT', 'ISSUED') THEN quantity ELSE -quantity END) FROM public.transactions WHERE vehicle_id IS NOT NULL), 0),
    'with_parties', COALESCE((SELECT SUM(CASE WHEN transaction_type IN ('PARTY_OUT', 'ISSUED') THEN quantity ELSE -quantity END) FROM public.transactions WHERE party_id IS NOT NULL), 0),
    'outstanding', COALESCE((SELECT SUM(CASE WHEN transaction_type IN ('VEHICLE_OUT', 'PARTY_OUT', 'ISSUED') THEN quantity ELSE -quantity END) FROM public.transactions), 0),
    'available', GREATEST(0, COALESCE((SELECT total_crates FROM public.inventory LIMIT 1), 0)
      - COALESCE((SELECT SUM(CASE WHEN transaction_type IN ('VEHICLE_OUT', 'PARTY_OUT', 'ISSUED') THEN quantity ELSE -quantity END) FROM public.transactions), 0)),
    'vehicle_count', (SELECT COUNT(*) FROM public.vehicles),
    'active_vehicle_count', (SELECT COUNT(*) FROM public.vehicles WHERE status = 'active'),
    'party_count', (SELECT COUNT(*) FROM public.parties),
    'active_party_count', (SELECT COUNT(*) FROM public.parties WHERE status = 'active'),
    'transaction_count', (SELECT COUNT(*) FROM public.transactions)
  );
$$;
REVOKE ALL ON FUNCTION public.dashboard_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.dashboard_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_stats() TO service_role;

-- 5. Atomic VEHICLE OUT
CREATE OR REPLACE FUNCTION public.vehicle_out(
  _vehicle_id UUID,
  _quantity INTEGER,
  _notes TEXT DEFAULT NULL,
  _transaction_date TIMESTAMPTZ DEFAULT now()
) RETURNS public.transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _total INTEGER;
  _outstanding INTEGER;
  _available INTEGER;
  _row public.transactions;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;
  IF _vehicle_id IS NULL THEN RAISE EXCEPTION 'Vehicle ID is required'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.vehicles WHERE id = _vehicle_id AND status = 'active') THEN
    RAISE EXCEPTION 'Vehicle is missing or inactive';
  END IF;

  -- Ensure inventory row exists and lock for atomicity
  INSERT INTO public.inventory (total_crates, updated_by) VALUES (0, auth.uid())
  ON CONFLICT (singleton) DO NOTHING;

  SELECT total_crates INTO _total FROM public.inventory FOR UPDATE;

  SELECT COALESCE(SUM(CASE WHEN transaction_type IN ('VEHICLE_OUT', 'PARTY_OUT', 'ISSUED') THEN quantity ELSE -quantity END), 0)
    INTO _outstanding FROM public.transactions;

  _available := GREATEST(0, COALESCE(_total, 0) - COALESCE(_outstanding, 0));

  IF _quantity > _available THEN
    RAISE EXCEPTION 'Only % crates are currently available', _available;
  END IF;

  INSERT INTO public.transactions (transaction_type, quantity, vehicle_id, transaction_date, notes, created_by)
  VALUES ('VEHICLE_OUT', _quantity, _vehicle_id, COALESCE(_transaction_date, now()), _notes, auth.uid())
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.vehicle_out(UUID, INTEGER, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vehicle_out(UUID, INTEGER, TEXT, TIMESTAMPTZ) TO service_role;

-- 6. Atomic VEHICLE IN
CREATE OR REPLACE FUNCTION public.vehicle_in(
  _vehicle_id UUID,
  _quantity INTEGER,
  _notes TEXT DEFAULT NULL,
  _transaction_date TIMESTAMPTZ DEFAULT now()
) RETURNS public.transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _vehicle_balance INTEGER;
  _row public.transactions;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;
  IF _vehicle_id IS NULL THEN RAISE EXCEPTION 'Vehicle ID is required'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.vehicles WHERE id = _vehicle_id) THEN
    RAISE EXCEPTION 'Vehicle not found';
  END IF;

  -- Lock inventory row for atomicity
  PERFORM 1 FROM public.inventory FOR UPDATE;

  SELECT COALESCE(SUM(CASE WHEN transaction_type IN ('VEHICLE_OUT', 'ISSUED') THEN quantity ELSE -quantity END), 0)
    INTO _vehicle_balance FROM public.transactions
    WHERE vehicle_id = _vehicle_id;

  IF _quantity > _vehicle_balance THEN
    RAISE EXCEPTION 'Cannot receive % crates. This vehicle currently has only % crates.', _quantity, _vehicle_balance;
  END IF;

  INSERT INTO public.transactions (transaction_type, quantity, vehicle_id, transaction_date, notes, created_by)
  VALUES ('VEHICLE_IN', _quantity, _vehicle_id, COALESCE(_transaction_date, now()), _notes, auth.uid())
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.vehicle_in(UUID, INTEGER, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vehicle_in(UUID, INTEGER, TEXT, TIMESTAMPTZ) TO service_role;

-- 7. Atomic PARTY OUT
CREATE OR REPLACE FUNCTION public.party_out(
  _party_id UUID,
  _quantity INTEGER,
  _notes TEXT DEFAULT NULL,
  _transaction_date TIMESTAMPTZ DEFAULT now()
) RETURNS public.transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _total INTEGER;
  _outstanding INTEGER;
  _available INTEGER;
  _row public.transactions;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;
  IF _party_id IS NULL THEN RAISE EXCEPTION 'Party ID is required'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.parties WHERE id = _party_id AND status = 'active') THEN
    RAISE EXCEPTION 'Party is missing or inactive';
  END IF;

  -- Ensure inventory row exists and lock for atomicity
  INSERT INTO public.inventory (total_crates, updated_by) VALUES (0, auth.uid())
  ON CONFLICT (singleton) DO NOTHING;

  SELECT total_crates INTO _total FROM public.inventory FOR UPDATE;

  SELECT COALESCE(SUM(CASE WHEN transaction_type IN ('VEHICLE_OUT', 'PARTY_OUT', 'ISSUED') THEN quantity ELSE -quantity END), 0)
    INTO _outstanding FROM public.transactions;

  _available := GREATEST(0, COALESCE(_total, 0) - COALESCE(_outstanding, 0));

  IF _quantity > _available THEN
    RAISE EXCEPTION 'Only % crates are currently available', _available;
  END IF;

  INSERT INTO public.transactions (transaction_type, quantity, party_id, transaction_date, notes, created_by)
  VALUES ('PARTY_OUT', _quantity, _party_id, COALESCE(_transaction_date, now()), _notes, auth.uid())
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.party_out(UUID, INTEGER, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.party_out(UUID, INTEGER, TEXT, TIMESTAMPTZ) TO service_role;

-- 8. Atomic PARTY IN
CREATE OR REPLACE FUNCTION public.party_in(
  _party_id UUID,
  _quantity INTEGER,
  _notes TEXT DEFAULT NULL,
  _transaction_date TIMESTAMPTZ DEFAULT now()
) RETURNS public.transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _party_balance INTEGER;
  _row public.transactions;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;
  IF _party_id IS NULL THEN RAISE EXCEPTION 'Party ID is required'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.parties WHERE id = _party_id) THEN
    RAISE EXCEPTION 'Party not found';
  END IF;

  -- Lock inventory row for atomicity
  PERFORM 1 FROM public.inventory FOR UPDATE;

  SELECT COALESCE(SUM(CASE WHEN transaction_type IN ('PARTY_OUT', 'ISSUED') THEN quantity ELSE -quantity END), 0)
    INTO _party_balance FROM public.transactions
    WHERE party_id = _party_id;

  IF _quantity > _party_balance THEN
    RAISE EXCEPTION 'Cannot receive % crates. This party currently has only % crates.', _quantity, _party_balance;
  END IF;

  INSERT INTO public.transactions (transaction_type, quantity, party_id, transaction_date, notes, created_by)
  VALUES ('PARTY_IN', _quantity, _party_id, COALESCE(_transaction_date, now()), _notes, auth.uid())
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.party_in(UUID, INTEGER, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.party_in(UUID, INTEGER, TEXT, TIMESTAMPTZ) TO service_role;
