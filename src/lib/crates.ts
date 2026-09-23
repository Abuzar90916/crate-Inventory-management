import { useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Narayan Dairy — Crate Management
 * Every value in this module is read from the Supabase database.
 * No mock data or localStorage is used as the business database.
 */

export type Vehicle = {
  id: string;
  vehicle_number: string;
  driver_name: string | null;
  driver_phone: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Party = {
  id: string;
  party_name: string;
  contact_person: string | null;
  phone: string | null;
  address: string | null;
  gst_number: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type TransactionType =
  | "VEHICLE_IN"
  | "VEHICLE_OUT"
  | "PARTY_IN"
  | "PARTY_OUT"
  | "ISSUED"
  | "RETURNED";

export type TransactionRow = {
  id: string;
  transaction_type: TransactionType;
  quantity: number;
  vehicle_id: string | null;
  party_id: string | null;
  transaction_date: string;
  notes: string | null;
  is_reversal: boolean;
  reverses_transaction_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type VehicleBalance = {
  vehicle_id: string;
  vehicle_number: string;
  driver_name: string | null;
  driver_phone?: string | null;
  status: string;
  issued: number;
  returned: number;
  balance: number;
  transaction_count: number;
  last_activity: string | null;
};

export type PartyBalance = {
  party_id: string;
  party_name: string;
  contact_person: string | null;
  phone?: string | null;
  status: string;
  issued: number;
  returned: number;
  balance: number;
  transaction_count: number;
  last_activity: string | null;
};

export type DashboardStats = {
  total_crates: number;
  with_vehicles: number;
  with_parties: number;
  outstanding: number;
  available: number;
  vehicle_count: number;
  active_vehicle_count: number;
  party_count: number;
  active_party_count: number;
  transaction_count: number;
};

export type Adjustment = {
  id: string;
  adjustment_type: string;
  quantity: number;
  reason: string;
  notes: string | null;
  created_at: string;
};

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as T;
}

export const qk = {
  stats: ["dashboard-stats"] as const,
  vehicles: ["vehicles"] as const,
  parties: ["parties"] as const,
  vehicleBalances: ["vehicle-balances"] as const,
  partyBalances: ["party-balances"] as const,
  transactions: ["transactions"] as const,
  inventory: ["inventory"] as const,
  adjustments: ["adjustments"] as const,
};

export function useDashboardStats() {
  return useQuery({
    queryKey: qk.stats,
    queryFn: async (): Promise<DashboardStats> => {
      // Compute figures directly from persisted Supabase tables
      const [invRes, txRes, vRes, pRes] = await Promise.all([
        supabase.from("inventory").select("total_crates").maybeSingle(),
        supabase.from("transactions").select("transaction_type, quantity, vehicle_id, party_id"),
        supabase.from("vehicles").select("id, status"),
        supabase.from("parties").select("id, status"),
      ]);

      const total_crates = invRes.data?.total_crates ?? 0;
      let with_vehicles = 0;
      let with_parties = 0;

      for (const t of txRes.data ?? []) {
        const isVehicleOut =
          t.transaction_type === "VEHICLE_OUT" || t.transaction_type === "ISSUED";
        const isVehicleIn =
          t.transaction_type === "VEHICLE_IN" || t.transaction_type === "RETURNED";
        const isPartyOut =
          t.transaction_type === "PARTY_OUT" || t.transaction_type === "ISSUED";
        const isPartyIn =
          t.transaction_type === "PARTY_IN" || t.transaction_type === "RETURNED";

        if (t.vehicle_id) {
          if (isVehicleOut) with_vehicles += t.quantity;
          else if (isVehicleIn) with_vehicles -= t.quantity;
        } else if (t.party_id) {
          if (isPartyOut) with_parties += t.quantity;
          else if (isPartyIn) with_parties -= t.quantity;
        }
      }

      with_vehicles = Math.max(0, with_vehicles);
      with_parties = Math.max(0, with_parties);
      const outstanding = with_vehicles + with_parties;
      const available = Math.max(0, total_crates - outstanding);

      const vehiclesList = vRes.data ?? [];
      const partiesList = pRes.data ?? [];

      return {
        total_crates,
        with_vehicles,
        with_parties,
        outstanding,
        available,
        vehicle_count: vehiclesList.length,
        active_vehicle_count: vehiclesList.filter((v) => v.status === "active").length,
        party_count: partiesList.length,
        active_party_count: partiesList.filter((p) => p.status === "active").length,
        transaction_count: txRes.data?.length ?? 0,
      };
    },
  });
}

export function useVehicles() {
  return useQuery({
    queryKey: qk.vehicles,
    queryFn: async (): Promise<Vehicle[]> =>
      unwrap(await supabase.from("vehicles").select("*").order("vehicle_number")),
  });
}

export function useParties() {
  return useQuery({
    queryKey: qk.parties,
    queryFn: async (): Promise<Party[]> =>
      unwrap(await supabase.from("parties").select("*").order("party_name")),
  });
}

export function useVehicleBalances() {
  return useQuery({
    queryKey: qk.vehicleBalances,
    queryFn: async (): Promise<VehicleBalance[]> => {
      // 1. Try vehicle_balances view
      const res = await supabase.from("vehicle_balances").select("*").order("vehicle_number");
      if (!res.error && res.data) {
        return res.data as unknown as VehicleBalance[];
      }

      // Fallback: derive directly from vehicles and transactions
      const [vRes, tRes] = await Promise.all([
        supabase.from("vehicles").select("*").order("vehicle_number"),
        supabase.from("transactions").select("*").not("vehicle_id", "is", null),
      ]);

      const vehicles = vRes.data ?? [];
      const txs = tRes.data ?? [];

      return vehicles.map((v) => {
        const vTxs = txs.filter((t) => t.vehicle_id === v.id);
        let issued = 0;
        let returned = 0;
        let last_activity: string | null = null;

        for (const t of vTxs) {
          if (t.transaction_type === "VEHICLE_OUT" || t.transaction_type === "ISSUED") {
            issued += t.quantity;
          } else if (t.transaction_type === "VEHICLE_IN" || t.transaction_type === "RETURNED") {
            returned += t.quantity;
          }
          if (!last_activity || new Date(t.transaction_date) > new Date(last_activity)) {
            last_activity = t.transaction_date;
          }
        }

        return {
          vehicle_id: v.id,
          vehicle_number: v.vehicle_number,
          driver_name: v.driver_name,
          driver_phone: v.driver_phone,
          status: v.status,
          issued,
          returned,
          balance: Math.max(0, issued - returned),
          transaction_count: vTxs.length,
          last_activity,
        };
      });
    },
  });
}

export function usePartyBalances() {
  return useQuery({
    queryKey: qk.partyBalances,
    queryFn: async (): Promise<PartyBalance[]> => {
      // 1. Try party_balances view
      const res = await supabase.from("party_balances").select("*").order("party_name");
      if (!res.error && res.data) {
        return res.data as unknown as PartyBalance[];
      }

      // Fallback: derive directly from parties and transactions
      const [pRes, tRes] = await Promise.all([
        supabase.from("parties").select("*").order("party_name"),
        supabase.from("transactions").select("*").not("party_id", "is", null),
      ]);

      const parties = pRes.data ?? [];
      const txs = tRes.data ?? [];

      return parties.map((p) => {
        const pTxs = txs.filter((t) => t.party_id === p.id);
        let issued = 0;
        let returned = 0;
        let last_activity: string | null = null;

        for (const t of pTxs) {
          if (t.transaction_type === "PARTY_OUT" || t.transaction_type === "ISSUED") {
            issued += t.quantity;
          } else if (t.transaction_type === "PARTY_IN" || t.transaction_type === "RETURNED") {
            returned += t.quantity;
          }
          if (!last_activity || new Date(t.transaction_date) > new Date(last_activity)) {
            last_activity = t.transaction_date;
          }
        }

        return {
          party_id: p.id,
          party_name: p.party_name,
          contact_person: p.contact_person,
          phone: p.phone,
          status: p.status,
          issued,
          returned,
          balance: Math.max(0, issued - returned),
          transaction_count: pTxs.length,
          last_activity,
        };
      });
    },
  });
}

export function useTransactions(limit = 200) {
  return useQuery({
    queryKey: [...qk.transactions, limit],
    queryFn: async (): Promise<TransactionRow[]> =>
      unwrap(
        await supabase
          .from("transactions")
          .select("*")
          .order("transaction_date", { ascending: false })
          .limit(limit),
      ) as unknown as TransactionRow[],
  });
}

export function useInventory() {
  return useQuery({
    queryKey: qk.inventory,
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory").select("*").maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export function useAdjustments() {
  return useQuery({
    queryKey: qk.adjustments,
    queryFn: async (): Promise<Adjustment[]> =>
      unwrap(
        await supabase
          .from("inventory_adjustments")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
      ),
  });
}

/**
 * Record a Vehicle IN or OUT movement with validation against available stock and balance.
 */
export async function recordVehicleMovement(params: {
  vehicleId: string;
  type: "IN" | "OUT";
  quantity: number;
  notes?: string;
  date?: string;
  currentVehicleBalance: number;
  availableInventory: number;
}) {
  const {
    vehicleId,
    type,
    quantity,
    notes,
    date,
    currentVehicleBalance,
    availableInventory,
  } = params;

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("Quantity must be a positive integer.");
  }

  const txDate = date ? new Date(date).toISOString() : new Date().toISOString();

  if (type === "OUT") {
    if (quantity > availableInventory) {
      throw new Error(`Only ${availableInventory} crates are currently available.`);
    }

    // Try dedicated RPC first
    const rpcRes = await supabase.rpc("vehicle_out" as any, {
      _vehicle_id: vehicleId,
      _quantity: quantity,
      _notes: notes || null,
      _transaction_date: txDate,
    });
    if (!rpcRes.error) return rpcRes.data;

    // Fallback: issue_crates RPC
    const fallbackRes = await supabase.rpc("issue_crates", {
      _vehicle_id: vehicleId,
      _quantity: quantity,
      _notes: notes ? `[VEHICLE_OUT] ${notes}` : "VEHICLE_OUT",
      _transaction_date: txDate,
    });
    if (!fallbackRes.error) return fallbackRes.data;

    // Fallback direct insert
    const insertRes = await supabase
      .from("transactions")
      .insert({
        transaction_type: "VEHICLE_OUT" as any,
        quantity,
        vehicle_id: vehicleId,
        transaction_date: txDate,
        notes: notes || null,
      })
      .select()
      .single();

    if (insertRes.error) throw new Error(fallbackRes.error.message || insertRes.error.message);
    return insertRes.data;
  } else {
    // IN
    if (quantity > currentVehicleBalance) {
      throw new Error(
        `Cannot receive ${quantity} crates. This vehicle currently has only ${currentVehicleBalance} crates.`,
      );
    }

    // Try dedicated RPC first
    const rpcRes = await supabase.rpc("vehicle_in" as any, {
      _vehicle_id: vehicleId,
      _quantity: quantity,
      _notes: notes || null,
      _transaction_date: txDate,
    });
    if (!rpcRes.error) return rpcRes.data;

    // Fallback: return_crates RPC
    const fallbackRes = await supabase.rpc("return_crates", {
      _vehicle_id: vehicleId,
      _quantity: quantity,
      _notes: notes ? `[VEHICLE_IN] ${notes}` : "VEHICLE_IN",
      _transaction_date: txDate,
    });
    if (!fallbackRes.error) return fallbackRes.data;

    // Fallback direct insert
    const insertRes = await supabase
      .from("transactions")
      .insert({
        transaction_type: "VEHICLE_IN" as any,
        quantity,
        vehicle_id: vehicleId,
        transaction_date: txDate,
        notes: notes || null,
      })
      .select()
      .single();

    if (insertRes.error) throw new Error(fallbackRes.error.message || insertRes.error.message);
    return insertRes.data;
  }
}

/**
 * Record a Party IN or OUT movement with validation against available stock and balance.
 */
export async function recordPartyMovement(params: {
  partyId: string;
  type: "IN" | "OUT";
  quantity: number;
  notes?: string;
  date?: string;
  currentPartyBalance: number;
  availableInventory: number;
}) {
  const {
    partyId,
    type,
    quantity,
    notes,
    date,
    currentPartyBalance,
    availableInventory,
  } = params;

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("Quantity must be a positive integer.");
  }

  const txDate = date ? new Date(date).toISOString() : new Date().toISOString();

  if (type === "OUT") {
    if (quantity > availableInventory) {
      throw new Error(`Only ${availableInventory} crates are currently available.`);
    }

    // Try dedicated RPC first
    const rpcRes = await supabase.rpc("party_out" as any, {
      _party_id: partyId,
      _quantity: quantity,
      _notes: notes || null,
      _transaction_date: txDate,
    });
    if (!rpcRes.error) return rpcRes.data;

    // Fallback: issue_crates RPC
    const fallbackRes = await supabase.rpc("issue_crates", {
      _party_id: partyId,
      _quantity: quantity,
      _notes: notes ? `[PARTY_OUT] ${notes}` : "PARTY_OUT",
      _transaction_date: txDate,
    });
    if (!fallbackRes.error) return fallbackRes.data;

    // Fallback direct insert
    const insertRes = await supabase
      .from("transactions")
      .insert({
        transaction_type: "PARTY_OUT" as any,
        quantity,
        party_id: partyId,
        transaction_date: txDate,
        notes: notes || null,
      })
      .select()
      .single();

    if (insertRes.error) throw new Error(fallbackRes.error.message || insertRes.error.message);
    return insertRes.data;
  } else {
    // IN
    if (quantity > currentPartyBalance) {
      throw new Error(
        `Cannot receive ${quantity} crates. This party currently has only ${currentPartyBalance} crates.`,
      );
    }

    // Try dedicated RPC first
    const rpcRes = await supabase.rpc("party_in" as any, {
      _party_id: partyId,
      _quantity: quantity,
      _notes: notes || null,
      _transaction_date: txDate,
    });
    if (!rpcRes.error) return rpcRes.data;

    // Fallback: return_crates RPC
    const fallbackRes = await supabase.rpc("return_crates", {
      _party_id: partyId,
      _quantity: quantity,
      _notes: notes ? `[PARTY_IN] ${notes}` : "PARTY_IN",
      _transaction_date: txDate,
    });
    if (!fallbackRes.error) return fallbackRes.data;

    // Fallback direct insert
    const insertRes = await supabase
      .from("transactions")
      .insert({
        transaction_type: "PARTY_IN" as any,
        quantity,
        party_id: partyId,
        transaction_date: txDate,
        notes: notes || null,
      })
      .select()
      .single();

    if (insertRes.error) throw new Error(fallbackRes.error.message || insertRes.error.message);
    return insertRes.data;
  }
}

export function invalidateAll(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: qk.stats }),
    queryClient.invalidateQueries({ queryKey: qk.vehicles }),
    queryClient.invalidateQueries({ queryKey: qk.parties }),
    queryClient.invalidateQueries({ queryKey: qk.vehicleBalances }),
    queryClient.invalidateQueries({ queryKey: qk.partyBalances }),
    queryClient.invalidateQueries({ queryKey: qk.transactions }),
    queryClient.invalidateQueries({ queryKey: qk.inventory }),
    queryClient.invalidateQueries({ queryKey: qk.adjustments }),
  ]);
}

/** Live sync: any change made by any user refreshes the data everyone sees. */
export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("narayan-crate-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () =>
        invalidateAll(queryClient),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicles" }, () =>
        invalidateAll(queryClient),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "parties" }, () =>
        invalidateAll(queryClient),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, () =>
        invalidateAll(queryClient),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory_adjustments" },
        () => invalidateAll(queryClient),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

export function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: unknown }).message);
    if (message) return message;
  }
  return fallback;
}
