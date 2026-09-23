import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Plus,
  Pencil,
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell, EmptyState } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import {
  errorMessage,
  invalidateAll,
  recordPartyMovement,
  useDashboardStats,
  useParties,
  usePartyBalances,
  type Party,
  type PartyBalance,
} from "@/lib/crates";

export const Route = createFileRoute("/_authenticated/parties")({
  head: () => ({
    meta: [
      { title: "Parties — Narayan Dairy Crate Management" },
      { name: "description", content: "Manage firms, buyers, and traders and record crate IN/OUT movements." },
      { property: "og:title", content: "Parties — Narayan Dairy Crate Management" },
      {
        property: "og:description",
        content: "Manage firms, buyers, and traders and record crate IN/OUT movements.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PartiesPage,
});

type FormState = {
  party_name: string;
  contact_person: string;
  phone: string;
  address: string;
  gst_number: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  party_name: "",
  contact_person: "",
  phone: "",
  address: "",
  gst_number: "",
  notes: "",
};

function PartiesPage() {
  const queryClient = useQueryClient();
  const parties = useParties();
  const balances = usePartyBalances();
  const stats = useDashboardStats();

  // Add / Edit party state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Party | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Detail inspection card
  const [inspectParty, setInspectParty] = useState<Party | null>(null);

  // IN / OUT Movement Modal State
  const [movementModal, setMovementModal] = useState<{
    open: boolean;
    type: "IN" | "OUT";
    party: Party | null;
  }>({
    open: false,
    type: "OUT",
    party: null,
  });

  const [quantity, setQuantity] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const availableInventory = stats.data?.available ?? 0;

  function balanceOf(id: string): PartyBalance | undefined {
    return balances.data?.find((b) => b.party_id === id);
  }

  // Save Party Mutation
  const saveParty = useMutation({
    mutationFn: async () => {
      const payload = {
        party_name: form.party_name.trim(),
        contact_person: form.contact_person.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        gst_number: form.gst_number.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (!payload.party_name) throw new Error("Party name is required.");

      if (editing) {
        const { data, error } = await supabase
          .from("parties")
          .update(payload)
          .eq("id", editing.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from("parties").insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (row) => {
      await invalidateAll(queryClient);
      toast.success(`Party "${row.party_name}" saved.`);
      setModalOpen(false);
      setForm(EMPTY_FORM);
      setEditing(null);
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Unable to save party.")),
  });

  // Movement Mutation
  const submitMovement = useMutation({
    mutationFn: async () => {
      if (!movementModal.party) throw new Error("No party selected.");
      const qty = parseInt(quantity, 10);
      const currentBalance = balanceOf(movementModal.party.id)?.balance ?? 0;

      if (!Number.isInteger(qty) || qty <= 0) {
        throw new Error("Quantity must be greater than zero.");
      }

      if (movementModal.type === "OUT") {
        if (qty > availableInventory) {
          throw new Error(`Only ${availableInventory} crates are currently available.`);
        }
      } else {
        if (qty > currentBalance) {
          throw new Error(
            `Cannot receive ${qty} crates. This party currently has only ${currentBalance} crates.`,
          );
        }
      }

      return recordPartyMovement({
        partyId: movementModal.party.id,
        type: movementModal.type,
        quantity: qty,
        notes: notes.trim() || undefined,
        date,
        currentPartyBalance: currentBalance,
        availableInventory,
      });
    },
    onSuccess: async () => {
      await invalidateAll(queryClient);
      const isOut = movementModal.type === "OUT";
      toast.success(
        isOut
          ? `Issued ${quantity} crates to ${movementModal.party?.party_name} (PARTY_OUT)`
          : `Received ${quantity} crates from ${movementModal.party?.party_name} (PARTY_IN)`,
      );
      closeMovementModal();
    },
    onError: (err: any) => {
      const msg = err.message || "Movement failed.";
      setValidationError(msg);
      toast.error(msg);
    },
  });

  function openMovement(party: Party, type: "IN" | "OUT") {
    setMovementModal({ open: true, type, party });
    setQuantity("");
    setDate(new Date().toISOString().split("T")[0]);
    setNotes("");
    setValidationError(null);
  }

  function closeMovementModal() {
    setMovementModal({ open: false, type: "OUT", party: null });
    setQuantity("");
    setNotes("");
    setValidationError(null);
  }

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(party: Party) {
    setEditing(party);
    setForm({
      party_name: party.party_name,
      contact_person: party.contact_person ?? "",
      phone: party.phone ?? "",
      address: party.address ?? "",
      gst_number: party.gst_number ?? "",
      notes: party.notes ?? "",
    });
    setModalOpen(true);
  }

  const activePartyList = parties.data ?? [];

  return (
    <AppShell
      title="Parties"
      description="Firms and businesses that receive crates OUT and return crates back IN."
      actions={
        <Button onClick={openNew} className="gap-2">
          <Plus className="size-4" /> Add Party
        </Button>
      }
    >
      {/* Detail Card if selected */}
      {inspectParty && (
        <div className="panel mb-6 border-2 border-primary/20 bg-primary/5 p-6 transition-all">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold tracking-wider text-primary uppercase">
                Party Details
              </span>
              <h2 className="mt-1 text-2xl font-bold text-foreground">
                {inspectParty.party_name}
              </h2>
              <p className="text-xs text-muted-foreground">
                Contact: {inspectParty.contact_person || "—"}
                {inspectParty.phone ? ` · ${inspectParty.phone}` : ""}
              </p>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-right">
                <span className="text-xs font-medium text-muted-foreground uppercase">
                  Current Crates
                </span>
                <p className="stat-figure text-3xl font-bold text-primary">
                  {balanceOf(inspectParty.id)?.balance ?? 0}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={() => openMovement(inspectParty, "IN")}
                  className="h-11 bg-emerald-600 px-5 text-sm font-bold text-white hover:bg-emerald-700 shadow-sm"
                >
                  <ArrowDownLeft className="mr-1.5 size-4 stroke-[3]" /> [ IN ]
                </Button>
                <Button
                  onClick={() => openMovement(inspectParty, "OUT")}
                  className="h-11 bg-blue-700 px-5 text-sm font-bold text-white hover:bg-blue-800 shadow-sm"
                >
                  <ArrowUpRight className="mr-1.5 size-4 stroke-[3]" /> [ OUT ]
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setInspectParty(null)}
                  className="text-xs text-muted-foreground"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Parties Table Panel */}
      <div className="panel overflow-hidden">
        {parties.isLoading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : activePartyList.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No parties added yet"
            description="Add your first party (e.g. ABC Traders) to start issuing and receiving crates."
            action={
              <Button onClick={openNew}>
                <Plus className="size-4" /> Add Party
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="font-bold">Party Name</TableHead>
                <TableHead className="font-bold">Contact</TableHead>
                <TableHead className="text-right font-bold">Current Crates</TableHead>
                <TableHead className="text-center font-bold">Status</TableHead>
                <TableHead className="text-right font-bold">Actions (IN / OUT)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activePartyList.map((party) => {
                const b = balanceOf(party.id);
                const currentBalance = b?.balance ?? 0;
                return (
                  <TableRow key={party.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="text-base font-bold text-foreground">
                      <button
                        onClick={() => setInspectParty(party)}
                        className="hover:underline text-left font-semibold"
                      >
                        {party.party_name}
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <div className="text-sm font-medium text-foreground">
                        {party.contact_person || "—"}
                      </div>
                      {party.phone && (
                        <div className="text-xs text-muted-foreground">{party.phone}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-mono text-lg font-bold text-primary">
                        {currentBalance.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={party.status === "active" ? "secondary" : "outline"}
                        className={
                          party.status === "active"
                            ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                            : ""
                        }
                      >
                        {party.status === "active" ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Prominent IN button */}
                        <Button
                          size="sm"
                          onClick={() => openMovement(party, "IN")}
                          className="bg-emerald-600 font-bold text-white hover:bg-emerald-700 h-8 px-3 shadow-xs"
                          title="Party IN: crates coming into dairy from party"
                        >
                          <ArrowDownLeft className="size-3.5 mr-1 stroke-[3]" /> [ IN ]
                        </Button>

                        {/* Prominent OUT button */}
                        <Button
                          size="sm"
                          onClick={() => openMovement(party, "OUT")}
                          className="bg-blue-700 font-bold text-white hover:bg-blue-800 h-8 px-3 shadow-xs"
                          title="Party OUT: crates going out of dairy to party"
                        >
                          <ArrowUpRight className="size-3.5 mr-1 stroke-[3]" /> [ OUT ]
                        </Button>

                        {/* Quick edit */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground"
                          onClick={() => openEdit(party)}
                          title="Edit party"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Movement Modal (IN / OUT) */}
      <Dialog open={movementModal.open} onOpenChange={(v) => !v && closeMovementModal()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              {movementModal.type === "IN" ? (
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <ArrowDownLeft className="size-5 stroke-[2.5]" />
                </div>
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                  <ArrowUpRight className="size-5 stroke-[2.5]" />
                </div>
              )}
              <div>
                <DialogTitle className="text-lg">
                  {movementModal.type === "IN" ? "Party IN (Receiving Crates)" : "Party OUT (Issuing Crates)"}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {movementModal.type === "IN"
                    ? "Crates are coming INTO the business FROM the party."
                    : "Crates are going OUT OF THE BUSINESS TO the party."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Validation Banner */}
          {validationError && (
            <div
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs font-semibold text-destructive"
              role="alert"
            >
              {validationError}
            </div>
          )}

          <div className="space-y-4 py-2">
            {/* Party info strip */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-3">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-medium">Party / Firm</p>
                <p className="text-base font-bold text-foreground">
                  {movementModal.party?.party_name}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-muted-foreground uppercase font-medium">
                  {movementModal.type === "IN" ? "Party Current Balance" : "Available Stock"}
                </p>
                <p className="font-mono text-base font-bold text-primary">
                  {movementModal.type === "IN"
                    ? `${balanceOf(movementModal.party?.id ?? "")?.balance ?? 0} crates`
                    : `${availableInventory.toLocaleString()} crates`}
                </p>
              </div>
            </div>

            {/* Quantity */}
            <div className="space-y-1.5">
              <Label htmlFor="party-qty" className="text-sm font-semibold">
                Quantity (Crates)
              </Label>
              <Input
                id="party-qty"
                type="number"
                min="1"
                step="1"
                required
                autoFocus
                placeholder="e.g. 200"
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value.replace(/[^0-9]/g, ""));
                  setValidationError(null);
                }}
                className="h-11 font-mono text-lg font-bold"
              />
              <p className="text-[11px] text-muted-foreground">
                {movementModal.type === "IN"
                  ? `Max receivable: ${balanceOf(movementModal.party?.id ?? "")?.balance ?? 0}`
                  : `Max available to issue: ${availableInventory}`}
              </p>
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <Label htmlFor="party-tx-date" className="text-sm font-medium">
                Date
              </Label>
              <Input
                id="party-tx-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-10 text-sm"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="party-notes" className="text-sm font-medium">
                Notes
              </Label>
              <Textarea
                id="party-notes"
                placeholder={
                  movementModal.type === "IN"
                    ? "e.g. Crates returned from wholesale customer"
                    : "e.g. Dispatched for milk distribution"
                }
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="text-sm"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={closeMovementModal}>
              Cancel
            </Button>
            <Button
              onClick={() => submitMovement.mutate()}
              disabled={submitMovement.isPending || !quantity}
              className={
                movementModal.type === "IN"
                  ? "bg-emerald-600 hover:bg-emerald-700 font-bold text-white"
                  : "bg-blue-700 hover:bg-blue-800 font-bold text-white"
              }
            >
              {submitMovement.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Recording…
                </>
              ) : movementModal.type === "IN" ? (
                "Confirm Party IN"
              ) : (
                "Confirm Party OUT"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Party Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Party" : "Add Party"}</DialogTitle>
            <DialogDescription>
              Party details are stored in Supabase and shared with all operators.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="p_name">Party Name *</Label>
              <Input
                id="p_name"
                placeholder="e.g. ABC Traders"
                value={form.party_name}
                onChange={(e) => setForm((f) => ({ ...f, party_name: e.target.value }))}
                className="font-semibold"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p_contact">Contact Person</Label>
              <Input
                id="p_contact"
                placeholder="e.g. Suresh Kumar"
                value={form.contact_person}
                onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p_phone">Phone</Label>
              <Input
                id="p_phone"
                placeholder="e.g. 9812345678"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p_address">Address</Label>
              <Input
                id="p_address"
                placeholder="e.g. APMC Market, Shop 42"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p_notes">Notes</Label>
              <Textarea
                id="p_notes"
                placeholder="Optional party notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveParty.mutate()} disabled={saveParty.isPending}>
              {saveParty.isPending ? "Saving…" : "Save Party"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
