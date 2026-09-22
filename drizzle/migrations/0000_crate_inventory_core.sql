-- ============ ENUM-ish domains via CHECK constraints ============

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- roles (separate table, never on profiles)
CREATE TYPE public.app_role AS ENUM ('admin', 'staff');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Roles readable by authenticated" ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- new user -> profile + staff role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name'), NEW.email)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN (SELECT count(*) FROM public.user_roles) = 0 THEN 'admin'::public.app_role ELSE 'staff'::public.app_role END)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at helper
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============ vehicles ============
CREATE TABLE public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_number TEXT NOT NULL UNIQUE,
  driver_name TEXT,
  driver_phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_number_not_blank CHECK (length(btrim(vehicle_number)) > 0)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Vehicles readable" ON public.vehicles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Vehicles insertable" ON public.vehicles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Vehicles updatable" ON public.vehicles FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Vehicles deletable by admin" ON public.vehicles FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER vehicles_touch BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ parties ============
CREATE TABLE public.parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_name TEXT NOT NULL UNIQUE,
  contact_person TEXT,
  phone TEXT,
  address TEXT,
  gst_number TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT party_name_not_blank CHECK (length(btrim(party_name)) > 0)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parties TO authenticated;
GRANT ALL ON public.parties TO service_role;
ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parties readable" ON public.parties FOR SELECT TO authenticated USING (true);
CREATE POLICY "Parties insertable" ON public.parties FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Parties updatable" ON public.parties FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Parties deletable by admin" ON public.parties FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER parties_touch BEFORE UPDATE ON public.parties FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ transactions ============
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('ISSUED','RETURNED')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  party_id UUID REFERENCES public.parties(id) ON DELETE RESTRICT,
  transaction_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  is_reversal BOOLEAN NOT NULL DEFAULT false,
  reverses_transaction_id UUID REFERENCES public.transactions(id) ON DELETE RESTRICT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT exactly_one_entity CHECK (
    (vehicle_id IS NOT NULL AND party_id IS NULL) OR (vehicle_id IS NULL AND party_id IS NOT NULL)
  )
);
CREATE INDEX transactions_vehicle_idx ON public.transactions(vehicle_id);
CREATE INDEX transactions_party_idx ON public.transactions(party_id);
CREATE INDEX transactions_date_idx ON public.transactions(transaction_date DESC);
CREATE UNIQUE INDEX transactions_one_reversal ON public.transactions(reverses_transaction_id) WHERE reverses_transaction_id IS NOT NULL;

GRANT SELECT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Transactions readable" ON public.transactions FOR SELECT TO authenticated USING (true);
-- no INSERT/UPDATE/DELETE policies: all writes go through SECURITY DEFINER RPCs (atomic + validated)

-- ============ inventory ============
CREATE TABLE public.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton BOOLEAN NOT NULL DEFAULT true,
  total_crates INTEGER NOT NULL DEFAULT 0 CHECK (total_crates >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  CONSTRAINT inventory_singleton_true CHECK (singleton)
);
CREATE UNIQUE INDEX inventory_single_row ON public.inventory(singleton);
GRANT SELECT ON public.inventory TO authenticated;
GRANT ALL ON public.inventory TO service_role;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Inventory readable" ON public.inventory FOR SELECT TO authenticated USING (true);

-- ============ inventory adjustments ============
CREATE TABLE public.inventory_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('PURCHASE','DAMAGE','LOST','CORRECTION_ADD','CORRECTION_REMOVE')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX inventory_adjustments_created_idx ON public.inventory_adjustments(created_at DESC);
GRANT SELECT ON public.inventory_adjustments TO authenticated;
GRANT ALL ON public.inventory_adjustments TO service_role;
ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Adjustments readable" ON public.inventory_adjustments FOR SELECT TO authenticated USING (true);

-- ============ derived views ============
CREATE VIEW public.vehicle_balances WITH (security_invoker = on) AS
SELECT v.id AS vehicle_id,
       v.vehicle_number,
       v.driver_name,
       v.status,
       COALESCE(SUM(CASE WHEN t.transaction_type = 'ISSUED' THEN t.quantity ELSE 0 END), 0)::int AS issued,
       COALESCE(SUM(CASE WHEN t.transaction_type = 'RETURNED' THEN t.quantity ELSE 0 END), 0)::int AS returned,
       COALESCE(SUM(CASE WHEN t.transaction_type = 'ISSUED' THEN t.quantity ELSE -t.quantity END), 0)::int AS balance,
       COUNT(t.id)::int AS transaction_count,
       MAX(t.transaction_date) AS last_activity
FROM public.vehicles v
LEFT JOIN public.transactions t ON t.vehicle_id = v.id
GROUP BY v.id;
GRANT SELECT ON public.vehicle_balances TO authenticated;

CREATE VIEW public.party_balances WITH (security_invoker = on) AS
SELECT p.id AS party_id,
       p.party_name,
       p.contact_person,
       p.status,
       COALESCE(SUM(CASE WHEN t.transaction_type = 'ISSUED' THEN t.quantity ELSE 0 END), 0)::int AS issued,
       COALESCE(SUM(CASE WHEN t.transaction_type = 'RETURNED' THEN t.quantity ELSE 0 END), 0)::int AS returned,
       COALESCE(SUM(CASE WHEN t.transaction_type = 'ISSUED' THEN t.quantity ELSE -t.quantity END), 0)::int AS balance,
       COUNT(t.id)::int AS transaction_count,
       MAX(t.transaction_date) AS last_activity
FROM public.parties p
LEFT JOIN public.transactions t ON t.party_id = p.id
GROUP BY p.id;
GRANT SELECT ON public.party_balances TO authenticated;

-- dashboard stats function (all values derived from data)
CREATE OR REPLACE FUNCTION public.dashboard_stats()
RETURNS JSON
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT json_build_object(
    'total_crates', COALESCE((SELECT total_crates FROM public.inventory LIMIT 1), 0),
    'with_vehicles', COALESCE((SELECT SUM(CASE WHEN transaction_type = 'ISSUED' THEN quantity ELSE -quantity END) FROM public.transactions WHERE vehicle_id IS NOT NULL), 0),
    'with_parties', COALESCE((SELECT SUM(CASE WHEN transaction_type = 'ISSUED' THEN quantity ELSE -quantity END) FROM public.transactions WHERE party_id IS NOT NULL), 0),
    'outstanding', COALESCE((SELECT SUM(CASE WHEN transaction_type = 'ISSUED' THEN quantity ELSE -quantity END) FROM public.transactions), 0),
    'available', COALESCE((SELECT total_crates FROM public.inventory LIMIT 1), 0)
      - COALESCE((SELECT SUM(CASE WHEN transaction_type = 'ISSUED' THEN quantity ELSE -quantity END) FROM public.transactions), 0),
    'vehicle_count', (SELECT COUNT(*) FROM public.vehicles),
    'active_vehicle_count', (SELECT COUNT(*) FROM public.vehicles WHERE status = 'active'),
    'party_count', (SELECT COUNT(*) FROM public.parties),
    'active_party_count', (SELECT COUNT(*) FROM public.parties WHERE status = 'active'),
    'transaction_count', (SELECT COUNT(*) FROM public.transactions)
  );
$$;
REVOKE ALL ON FUNCTION public.dashboard_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.dashboard_stats() TO authenticated;

-- ============ atomic operations ============
CREATE OR REPLACE FUNCTION public.issue_crates(
  _quantity INTEGER,
  _vehicle_id UUID DEFAULT NULL,
  _party_id UUID DEFAULT NULL,
  _notes TEXT DEFAULT NULL,
  _transaction_date TIMESTAMPTZ DEFAULT now()
) RETURNS public.transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _total INTEGER;
  _outstanding INTEGER;
  _row public.transactions;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;
  IF (_vehicle_id IS NULL) = (_party_id IS NULL) THEN
    RAISE EXCEPTION 'Choose exactly one vehicle or one party';
  END IF;

  -- serialise all inventory-affecting operations on the single inventory row
  SELECT total_crates INTO _total FROM public.inventory FOR UPDATE;
  IF _total IS NULL THEN
    RAISE EXCEPTION 'Total crate inventory has not been set yet';
  END IF;

  IF _vehicle_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vehicles WHERE id = _vehicle_id AND status = 'active') THEN
    RAISE EXCEPTION 'Vehicle is missing or inactive';
  END IF;
  IF _party_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.parties WHERE id = _party_id AND status = 'active') THEN
    RAISE EXCEPTION 'Party is missing or inactive';
  END IF;

  SELECT COALESCE(SUM(CASE WHEN transaction_type = 'ISSUED' THEN quantity ELSE -quantity END), 0)
    INTO _outstanding FROM public.transactions;

  IF _quantity > (_total - _outstanding) THEN
    RAISE EXCEPTION 'Only % crates are available', GREATEST(_total - _outstanding, 0);
  END IF;

  INSERT INTO public.transactions (transaction_type, quantity, vehicle_id, party_id, transaction_date, notes, created_by)
  VALUES ('ISSUED', _quantity, _vehicle_id, _party_id, COALESCE(_transaction_date, now()), _notes, auth.uid())
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;
REVOKE ALL ON FUNCTION public.issue_crates(INTEGER, UUID, UUID, TEXT, TIMESTAMPTZ) FROM public;
GRANT EXECUTE ON FUNCTION public.issue_crates(INTEGER, UUID, UUID, TEXT, TIMESTAMPTZ) TO authenticated;

CREATE OR REPLACE FUNCTION public.return_crates(
  _quantity INTEGER,
  _vehicle_id UUID DEFAULT NULL,
  _party_id UUID DEFAULT NULL,
  _notes TEXT DEFAULT NULL,
  _transaction_date TIMESTAMPTZ DEFAULT now()
) RETURNS public.transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _balance INTEGER;
  _row public.transactions;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;
  IF (_vehicle_id IS NULL) = (_party_id IS NULL) THEN
    RAISE EXCEPTION 'Choose exactly one vehicle or one party';
  END IF;

  PERFORM 1 FROM public.inventory FOR UPDATE;

  SELECT COALESCE(SUM(CASE WHEN transaction_type = 'ISSUED' THEN quantity ELSE -quantity END), 0)
    INTO _balance FROM public.transactions
    WHERE (_vehicle_id IS NOT NULL AND vehicle_id = _vehicle_id)
       OR (_party_id IS NOT NULL AND party_id = _party_id);

  IF _quantity > _balance THEN
    RAISE EXCEPTION 'Only % crates are outstanding for this holder', _balance;
  END IF;

  INSERT INTO public.transactions (transaction_type, quantity, vehicle_id, party_id, transaction_date, notes, created_by)
  VALUES ('RETURNED', _quantity, _vehicle_id, _party_id, COALESCE(_transaction_date, now()), _notes, auth.uid())
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;
REVOKE ALL ON FUNCTION public.return_crates(INTEGER, UUID, UUID, TEXT, TIMESTAMPTZ) FROM public;
GRANT EXECUTE ON FUNCTION public.return_crates(INTEGER, UUID, UUID, TEXT, TIMESTAMPTZ) TO authenticated;

-- reversal: creates an opposite, audit-linked transaction instead of editing history
CREATE OR REPLACE FUNCTION public.reverse_transaction(_transaction_id UUID, _reason TEXT)
RETURNS public.transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _orig public.transactions;
  _row public.transactions;
  _balance INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _reason IS NULL OR length(btrim(_reason)) = 0 THEN RAISE EXCEPTION 'A reason is required'; END IF;

  PERFORM 1 FROM public.inventory FOR UPDATE;

  SELECT * INTO _orig FROM public.transactions WHERE id = _transaction_id;
  IF _orig.id IS NULL THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF _orig.is_reversal THEN RAISE EXCEPTION 'A reversal cannot itself be reversed'; END IF;
  IF EXISTS (SELECT 1 FROM public.transactions WHERE reverses_transaction_id = _transaction_id) THEN
    RAISE EXCEPTION 'This entry has already been reversed';
  END IF;

  IF _orig.transaction_type = 'ISSUED' THEN
    SELECT COALESCE(SUM(CASE WHEN transaction_type = 'ISSUED' THEN quantity ELSE -quantity END), 0)
      INTO _balance FROM public.transactions
      WHERE (_orig.vehicle_id IS NOT NULL AND vehicle_id = _orig.vehicle_id)
         OR (_orig.party_id IS NOT NULL AND party_id = _orig.party_id);
    IF _orig.quantity > _balance THEN
      RAISE EXCEPTION 'Reversing this entry would make the holder balance negative';
    END IF;
  END IF;

  INSERT INTO public.transactions (transaction_type, quantity, vehicle_id, party_id, transaction_date, notes, is_reversal, reverses_transaction_id, created_by)
  VALUES (
    CASE WHEN _orig.transaction_type = 'ISSUED' THEN 'RETURNED' ELSE 'ISSUED' END,
    _orig.quantity, _orig.vehicle_id, _orig.party_id, now(),
    'Reversal: ' || _reason, true, _orig.id, auth.uid()
  ) RETURNING * INTO _row;

  RETURN _row;
END;
$$;
REVOKE ALL ON FUNCTION public.reverse_transaction(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.reverse_transaction(UUID, TEXT) TO authenticated;

-- inventory adjustment: changes total owned crates with an audit row
CREATE OR REPLACE FUNCTION public.adjust_inventory(
  _adjustment_type TEXT,
  _quantity INTEGER,
  _reason TEXT,
  _notes TEXT DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
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

  SELECT total_crates INTO _total FROM public.inventory FOR UPDATE;

  _delta := CASE WHEN _adjustment_type IN ('PURCHASE','CORRECTION_ADD') THEN _quantity ELSE -_quantity END;
  _new_total := _total + _delta;

  SELECT COALESCE(SUM(CASE WHEN transaction_type = 'ISSUED' THEN quantity ELSE -quantity END), 0)
    INTO _outstanding FROM public.transactions;

  IF _new_total < 0 THEN RAISE EXCEPTION 'Total crates cannot go below zero'; END IF;
  IF _new_total < _outstanding THEN
    RAISE EXCEPTION 'Total crates cannot be lower than the % crates currently outstanding', _outstanding;
  END IF;

  UPDATE public.inventory SET total_crates = _new_total, updated_by = auth.uid(), updated_at = now();

  INSERT INTO public.inventory_adjustments (adjustment_type, quantity, reason, notes, created_by)
  VALUES (_adjustment_type, _quantity, _reason, _notes, auth.uid());

  RETURN json_build_object('total_crates', _new_total, 'outstanding', _outstanding, 'available', _new_total - _outstanding);
END;
$$;
REVOKE ALL ON FUNCTION public.adjust_inventory(TEXT, INTEGER, TEXT, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.adjust_inventory(TEXT, INTEGER, TEXT, TEXT) TO authenticated;

-- deactivate/delete safety for vehicles & parties
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
REVOKE ALL ON FUNCTION public.delete_vehicle(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_vehicle(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_party(_party_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.transactions WHERE party_id = _party_id) THEN
    UPDATE public.parties SET status = 'inactive' WHERE id = _party_id;
    RETURN json_build_object('action', 'deactivated');
  END IF;
  DELETE FROM public.parties WHERE id = _party_id;
  RETURN json_build_object('action', 'deleted');
END;
$$;
REVOKE ALL ON FUNCTION public.delete_party(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_party(UUID) TO authenticated;

-- ============ realtime ============
ALTER TABLE public.vehicles REPLICA IDENTITY FULL;
ALTER TABLE public.parties REPLICA IDENTITY FULL;
ALTER TABLE public.transactions REPLICA IDENTITY FULL;
ALTER TABLE public.inventory REPLICA IDENTITY FULL;
ALTER TABLE public.inventory_adjustments REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.parties;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_adjustments;