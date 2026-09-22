import { useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Every value in this module is read from the database.
 * Nothing here is cached to localStorage or seeded with sample rows.
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

export type TransactionRow = {
  id: string;
  transaction_type: "ISSUED" | "RETURNED";
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
      const { data, error } = await supabase.rpc("dashboard_stats");
      if (error) throw new Error(error.message);
      return data as unknown as DashboardStats;
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
    queryFn: async (): Promise<VehicleBalance[]> =>
      unwrap(await supabase.from("vehicle_balances").select("*").order("vehicle_number")) as unknown as VehicleBalance[],
  });
}

export function usePartyBalances() {
  return useQuery({
    queryKey: qk.partyBalances,
    queryFn: async (): Promise<PartyBalance[]> =>
      unwrap(await supabase.from("party_balances").select("*").order("party_name")) as unknown as PartyBalance[],
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
      .channel("crate-ledger-sync")
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
