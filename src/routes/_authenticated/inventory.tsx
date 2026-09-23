import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Package, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell, EmptyState } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage, invalidateAll, useAdjustments, useDashboardStats } from "@/lib/crates";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — Narayan Dairy" },
      { name: "description", content: "Track total crates owned, outstanding and available." },
      { property: "og:title", content: "Inventory — Narayan Dairy" },
      { property: "og:description", content: "Track total crates owned, outstanding and available." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InventoryPage,
});

const TYPES = [
  { value: "PURCHASE", label: "Crates bought" },
  { value: "DAMAGE", label: "Damaged / written off" },
  { value: "LOST", label: "Lost" },
  { value: "CORRECTION_ADD", label: "Correction — add" },
  { value: "CORRECTION_REMOVE", label: "Correction — remove" },
];

function InventoryPage() {
  const queryClient = useQueryClient();
  const stats = useDashboardStats();
  const adjustments = useAdjustments();

  const [type, setType] = useState("PURCHASE");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const adjust = useMutation({
    mutationFn: async () => {
      const qty = Number(quantity);
      if (!Number.isInteger(qty) || qty <= 0) throw new Error("Enter a whole number above zero.");
      if (!reason.trim()) throw new Error("A short reason is required.");
      const { data, error } = await supabase.rpc("adjust_inventory", {
        _adjustment_type: type,
        _quantity: qty,
        _reason: reason.trim(),
        ...(notes.trim() ? { _notes: notes.trim() } : {}),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await invalidateAll(queryClient);
      toast.success("Stock updated.");
      setQuantity("");
      setReason("");
      setNotes("");
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Unable to update stock. No changes were made.")),
  });

  const s = stats.data;

  return (
    <AppShell
      title="Inventory"
      description="How many crates you own in total, and what is left to issue."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Total crates owned", value: s?.total_crates ?? 0 },
          { label: "Outstanding", value: s?.outstanding ?? 0 },
          { label: "Available", value: s?.available ?? 0 },
        ].map((item) => (
          <div key={item.label} className="panel p-5">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {item.label}
            </p>
            <p className="stat-figure mt-2 text-3xl font-semibold">
              {item.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[22rem_1fr]">
        <section className="panel h-fit p-5">
          <h2 className="text-base font-semibold">Update stock</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every change is logged with a reason.
          </p>
          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label>Reason type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adj-qty">Number of crates</Label>
              <Input
                id="adj-qty"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adj-reason">Reason</Label>
              <Input
                id="adj-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="New crates purchased"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adj-notes">Notes</Label>
              <Textarea
                id="adj-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <Button className="w-full" onClick={() => adjust.mutate()} disabled={adjust.isPending}>
              {adjust.isPending && <Loader2 className="size-4 animate-spin" />}
              Save change
            </Button>
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold">Stock change log</h2>
          </div>
          {(adjustments.data ?? []).length === 0 ? (
            <EmptyState
              icon={Package}
              title="No stock changes yet"
              description="Record how many crates you own to get started."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Crates</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adjustments.data!.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(a.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {TYPES.find((t) => t.value === a.adjustment_type)?.label ??
                        a.adjustment_type}
                    </TableCell>
                    <TableCell className="num text-right font-semibold">
                      {["PURCHASE", "CORRECTION_ADD"].includes(a.adjustment_type) ? "+" : "−"}
                      {a.quantity}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{a.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </div>
    </AppShell>
  );
}
