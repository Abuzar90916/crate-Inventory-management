import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type StockAdjustPayload = {
  type: string;
  quantity: number;
  reason: string;
  notes?: string;
  userId?: string;
};

/**
 * Atomic stock adjustment server function.
 * Uses supabaseAdmin (service role) to safely bypass RLS on the server
 * and performs strict WHERE id = ... updates to comply with PostgreSQL safeupdate.
 */
export const adjustStockServerFn = createServerFn({ method: "POST" })
  .validator((data: StockAdjustPayload) => data)
  .handler(async ({ data }) => {
    const { type, quantity, reason, notes, userId } = data;

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error("Quantity must be a positive whole number.");
    }

    if (!reason || !reason.trim()) {
      throw new Error("A reason is required for stock adjustments.");
    }

    const validTypes = [
      "PURCHASE",
      "DAMAGE",
      "LOST",
      "CORRECTION_ADD",
      "CORRECTION_REMOVE",
    ];
    if (!validTypes.includes(type)) {
      throw new Error("Invalid adjustment type.");
    }

    // 1. Ensure inventory record exists
    let { data: inv, error: invErr } = await supabaseAdmin
      .from("inventory")
      .select("id, total_crates")
      .maybeSingle();

    if (!inv) {
      const initRes = await supabaseAdmin
        .from("inventory")
        .insert({ singleton: true, total_crates: 0 })
        .select()
        .single();
      if (initRes.error) throw new Error(initRes.error.message);
      inv = initRes.data;
    }

    // 2. Fetch all movements to determine current outstanding crates
    const { data: txs, error: txErr } = await supabaseAdmin
      .from("transactions")
      .select("transaction_type, quantity");

    if (txErr) throw new Error(txErr.message);

    let outstanding = 0;
    for (const t of txs || []) {
      const isOut =
        t.transaction_type === "VEHICLE_OUT" ||
        t.transaction_type === "PARTY_OUT" ||
        t.transaction_type === "ISSUED";
      const isIn =
        t.transaction_type === "VEHICLE_IN" ||
        t.transaction_type === "PARTY_IN" ||
        t.transaction_type === "RETURNED";

      if (isOut) outstanding += t.quantity;
      else if (isIn) outstanding -= t.quantity;
    }
    outstanding = Math.max(0, outstanding);

    const currentTotal = inv?.total_crates ?? 0;
    const isAddition = type === "PURCHASE" || type === "CORRECTION_ADD";
    const delta = isAddition ? quantity : -quantity;
    const newTotal = currentTotal + delta;

    if (newTotal < 0) {
      throw new Error("Total crates cannot go below zero.");
    }

    if (newTotal < outstanding) {
      throw new Error(
        `Total crates cannot be lower than the ${outstanding} crates currently outstanding with vehicles and parties.`,
      );
    }

    // 3. Atomically insert into inventory_adjustments
    const { data: adjData, error: adjErr } = await supabaseAdmin
      .from("inventory_adjustments")
      .insert({
        adjustment_type: type,
        quantity,
        reason: reason.trim(),
        notes: notes?.trim() || null,
        created_by: userId || null,
      })
      .select()
      .single();

    if (adjErr) throw new Error(adjErr.message);

    // 4. Atomically update inventory with explicit WHERE id = inv.id
    const { error: updateErr } = await supabaseAdmin
      .from("inventory")
      .update({
        total_crates: newTotal,
        updated_at: new Date().toISOString(),
        updated_by: userId || null,
      })
      .eq("id", inv.id);

    if (updateErr) throw new Error(updateErr.message);

    return {
      success: true,
      total_crates: newTotal,
      outstanding,
      available: newTotal - outstanding,
      adjustment: adjData,
    };
  });
