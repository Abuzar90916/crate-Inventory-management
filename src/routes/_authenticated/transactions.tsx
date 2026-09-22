import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell, EmptyState } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  errorMessage,
  invalidateAll,
  useDashboardStats,
  useParties,
  usePartyBalances,
  useTransactions,
  useVehicleBalances,
  useVehicles,
} from "@/lib/crates";

export const Route = createFileRoute("/_authenticated/transactions")({
  head: () => ({
    meta: [
      { title: "Movements — CrateLedger" },
      { name: "description", content: "Issue crates, record returns and review the full history." },
      { property: "og:title", content: "Movements — CrateLedger" },
      { property: "og:description", content: "Issue crates, record returns and review the full history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TransactionsPage,
});

function TransactionsPage() {
  const queryClient = useQueryClient();
  const vehicles = useVehicles();
  const parties = useParties();
  const vehicleBalances = useVehicleBalances();
  const partyBalances = usePartyBalances();
  const transactions = useTransactions(300);
  const stats = useDashboardStats();

  const [type, setType] = useState<"ISSUED" | "RETURNED">("ISSUED");
  const [holderKind, setHolderKind] = useState<"vehicle" | "party">("vehicle");
  const [holderId, setHolderId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [reversing, setReversing] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const activeVehicles = (vehicles.data ?? []).filter((v) => v.status === "active");
  const activeParties = (parties.data ?? []).filter((p) => p.status === "active");

  const holderBalance = useMemo(() => {
    if (!holderId) return null;
    return holderKind === "vehicle"
      ? (vehicleBalances.data?.find((b) => b.vehicle_id === holderId)?.balance ?? 0)
      : (partyBalances.data?.find((b) => b.party_id === holderId)?.balance ?? 0);
  }, [holderId, holderKind, vehicleBalances.data, partyBalances.data]);

  const record = useMutation({
    mutationFn: async () => {
      const qty = Number(quantity);
      if (!holderId) throw new Error("Select a vehicle or a party first.");
      if (!Number.isInteger(qty) || qty <= 0) throw new Error("Enter a whole number above zero.");

      const args = {
        _quantity: qty,
        ...(holderKind === "vehicle" ? { _vehicle_id: holderId } : { _party_id: holderId }),
        ...(notes.trim() ? { _notes: notes.trim() } : {}),
      };
      const { data, error } = await supabase.rpc(
        type === "ISSUED" ? "issue_crates" : "return_crates",
        args,
      );
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await invalidateAll(queryClient);
      toast.success(type === "ISSUED" ? "Crates issued." : "Crates received back.");
      setQuantity("");
      setNotes("");
    },
    onError: (error) =>
      toast.error(
        errorMessage(
          error,
          type === "ISSUED"
            ? "Unable to issue crates. No changes were made."
            : "Unable to record the return. No changes were made.",
        ),
      ),
  });

  const reverse = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("reverse_transaction", {
        _transaction_id: reversing!,
        _reason: reason.trim(),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await invalidateAll(queryClient);
      toast.success("Correcting entry recorded. The original entry stays in the history.");
      setReversing(null);
      setReason("");
    },
    onError: (error) => toast.error(errorMessage(error, "Unable to record the correction.")),
  });

  const holderName = (vehicleId: string | null, partyId: string | null) =>
    vehicleId
      ? (vehicles.data?.find((v) => v.id === vehicleId)?.vehicle_number ?? "Vehicle")
      : (parties.data?.find((p) => p.id === partyId)?.party_name ?? "Party");

  const reversedIds = new Set(
    (transactions.data ?? []).map((t) => t.reverses_transaction_id).filter(Boolean) as string[],
  );

  return (
    <AppShell
      title="Movements"
      description="Record crates going out and coming back. Balances follow automatically."
    >
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <section className="panel h-fit p-5">
          <Tabs value={type} onValueChange={(v) => setType(v as "ISSUED" | "RETURNED")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="ISSUED">Issue out</TabsTrigger>
              <TabsTrigger value="RETURNED">Receive back</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label>Holder type</Label>
              <Tabs
                value={holderKind}
                onValueChange={(v) => {
                  setHolderKind(v as "vehicle" | "party");
                  setHolderId("");
                }}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="vehicle">Vehicle</TabsTrigger>
                  <TabsTrigger value="party">Party</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="space-y-2">
              <Label>{holderKind === "vehicle" ? "Vehicle" : "Party"}</Label>
              <Select value={holderId} onValueChange={setHolderId}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      holderKind === "vehicle"
                        ? activeVehicles.length
                          ? "Choose a vehicle"
                          : "No vehicles added yet"
                        : activeParties.length
                          ? "Choose a party"
                          : "No parties added yet"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {holderKind === "vehicle"
                    ? activeVehicles.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.vehicle_number}
                        </SelectItem>
                      ))
                    : activeParties.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.party_name}
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
              {holderId && (
                <p className="text-xs text-muted-foreground">
                  Currently holding <span className="num font-medium">{holderBalance}</span> crates.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">Number of crates</Label>
              <Input
                id="quantity"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="0"
              />
              {type === "ISSUED" && (
                <p className="text-xs text-muted-foreground">
                  <span className="num font-medium">{stats.data?.available ?? 0}</span> crates
                  available right now.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="movement-notes">Notes</Label>
              <Textarea
                id="movement-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional reference, market, or remark"
              />
            </div>

            <Button className="w-full" onClick={() => record.mutate()} disabled={record.isPending}>
              {record.isPending && <Loader2 className="size-4 animate-spin" />}
              {type === "ISSUED" ? "Issue crates" : "Record return"}
            </Button>
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold">History</h2>
            <p className="text-sm text-muted-foreground">
              Entries are never edited. Mistakes are fixed with a correcting entry.
            </p>
          </div>
          {(transactions.data ?? []).length === 0 ? (
            <EmptyState
              icon={ArrowLeftRight}
              title="No transactions recorded yet"
              description="Issue or receive crates and the full history builds up here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Holder</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Crates</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Correct</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.data!.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(t.transaction_date).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-medium">
                      {holderName(t.vehicle_id, t.party_id)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={t.transaction_type === "ISSUED" ? "default" : "secondary"}>
                          {t.transaction_type === "ISSUED" ? "Issued" : "Returned"}
                        </Badge>
                        {t.is_reversal && <Badge variant="outline">Correction</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="num text-right font-semibold">{t.quantity}</TableCell>
                    <TableCell className="max-w-[16rem] truncate text-muted-foreground">
                      {t.notes ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {!t.is_reversal && !reversedIds.has(t.id) && (
                        <Button variant="ghost" size="sm" onClick={() => setReversing(t.id)}>
                          <Undo2 className="size-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </div>

      <Dialog open={!!reversing} onOpenChange={(v) => !v && setReversing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record a correction</DialogTitle>
            <DialogDescription>
              The original entry stays in the history. A matching opposite entry is added so the
              balance is right again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Entered against the wrong vehicle"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReversing(null)}>
              Cancel
            </Button>
            <Button onClick={() => reverse.mutate()} disabled={reverse.isPending}>
              {reverse.isPending && <Loader2 className="size-4 animate-spin" />}
              Record correction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
