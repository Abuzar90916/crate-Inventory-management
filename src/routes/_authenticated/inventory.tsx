import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Package, Loader2, Layers, CheckCircle2, Truck, Users, Clock } from "lucide-react";
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
import { adjustStockServerFn } from "@/lib/stock.functions";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — Narayan Dairy Crate Management" },
      { name: "description", content: "Track total crates owned, outstanding and available." },
      { property: "og:title", content: "Inventory — Narayan Dairy Crate Management" },
      {
        property: "og:description",
        content: "Track total crates owned, outstanding and available.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InventoryPage,
});

const TYPES = [
  { value: "PURCHASE", label: "Crates bought / Added stock" },
  { value: "DAMAGE", label: "Damaged / written off" },
  { value: "LOST", label: "Lost crates" },
  { value: "CORRECTION_ADD", label: "Stock audit — Add" },
  { value: "CORRECTION_REMOVE", label: "Stock audit — Remove" },
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
      const qty = parseInt(quantity, 10);
      if (!Number.isInteger(qty) || qty <= 0) throw new Error("Enter a whole number above zero.");
      if (!reason.trim()) throw new Error("A short reason is required.");

      const userRes = await supabase.auth.getUser();
      const userId = userRes.data.user?.id;

      return await adjustStockServerFn({
        data: {
          type,
          quantity: qty,
          reason: reason.trim(),
          notes: notes.trim() || undefined,
          userId,
        },
      });
    },
    onSuccess: async () => {
      await invalidateAll(queryClient);
      toast.success("Crate inventory updated.");
      setQuantity("");
      setReason("");
      setNotes("");
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Unable to update stock. No changes were made.")),
  });

  const s = stats.data;

  const metricCards = [
    {
      label: "Total Owned Crates",
      value: s?.total_crates ?? 0,
      icon: Layers,
      color: "text-foreground",
      bg: "bg-muted/50",
    },
    {
      label: "Available Crates",
      value: s?.available ?? 0,
      icon: CheckCircle2,
      color: "text-emerald-700",
      bg: "bg-emerald-500/10",
    },
    {
      label: "With Vehicles",
      value: s?.with_vehicles ?? 0,
      icon: Truck,
      color: "text-blue-700",
      bg: "bg-blue-500/10",
    },
    {
      label: "With Parties",
      value: s?.with_parties ?? 0,
      icon: Users,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Outstanding",
      value: s?.outstanding ?? 0,
      icon: Clock,
      color: "text-amber-700",
      bg: "bg-amber-500/10",
    },
  ];

  return (
    <AppShell
      title="Inventory"
      description="Live inventory figures: total crates owned, available in dairy, and outstanding in field."
    >
      {/* 5 Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {metricCards.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="panel p-5 border bg-card">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {item.label}
                </p>
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${item.bg}`}>
                  <Icon className={`size-4 ${item.color}`} />
                </div>
              </div>
              <p className={`stat-figure mt-2 font-mono text-2xl font-bold ${item.color}`}>
                {item.value.toLocaleString()}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[22rem_1fr]">
        {/* Update Stock Section */}
        <section className="panel h-fit p-5 border bg-card">
          <h2 className="text-base font-bold text-foreground">Adjust Stock</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Record crate purchases, damaged crates, losses, or manual inventory audits.
          </p>

          <div className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Adjustment Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-10">
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

            <div className="space-y-1.5">
              <Label htmlFor="adj-qty" className="text-xs font-medium">
                Number of Crates *
              </Label>
              <Input
                id="adj-qty"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="e.g. 500"
                className="h-10 font-mono font-bold"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="adj-reason" className="text-xs font-medium">
                Reason *
              </Label>
              <Input
                id="adj-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. New crates received from supplier"
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="adj-notes" className="text-xs font-medium">
                Notes
              </Label>
              <Textarea
                id="adj-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional invoice number, supplier details, etc."
                rows={2}
                className="text-xs"
              />
            </div>

            <Button
              className="w-full bg-primary hover:bg-primary/90 font-semibold"
              onClick={() => adjust.mutate()}
              disabled={adjust.isPending || !quantity || !reason.trim()}
            >
              {adjust.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save Stock Adjustment
            </Button>
          </div>
        </section>

        {/* Stock Change Log */}
        <section className="panel overflow-hidden border bg-card">
          <div className="border-b border-border bg-muted/30 px-5 py-4">
            <h2 className="text-sm font-bold text-foreground">Stock Adjustment History</h2>
          </div>

          {(adjustments.data ?? []).length === 0 ? (
            <EmptyState
              icon={Package}
              title="No stock changes yet"
              description="Adjust stock above to record starting crate inventory."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-semibold">When</TableHead>
                  <TableHead className="text-xs font-semibold">Type</TableHead>
                  <TableHead className="text-right text-xs font-semibold">Crates</TableHead>
                  <TableHead className="text-xs font-semibold">Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adjustments.data!.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(a.created_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {TYPES.find((t) => t.value === a.adjustment_type)?.label ??
                        a.adjustment_type}
                    </TableCell>
                    <TableCell className="font-mono text-right text-sm font-bold">
                      <span
                        className={
                          ["PURCHASE", "CORRECTION_ADD"].includes(a.adjustment_type)
                            ? "text-emerald-700"
                            : "text-destructive"
                        }
                      >
                        {["PURCHASE", "CORRECTION_ADD"].includes(a.adjustment_type) ? "+" : "−"}
                        {a.quantity}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.reason}</TableCell>
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
