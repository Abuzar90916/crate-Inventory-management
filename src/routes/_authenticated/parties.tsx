import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Pencil, Ban, Loader2 } from "lucide-react";
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
import { errorMessage, invalidateAll, useParties, usePartyBalances, type Party } from "@/lib/crates";

export const Route = createFileRoute("/_authenticated/parties")({
  head: () => ({
    meta: [
      { title: "Parties — Narayan Dairy" },
      { name: "description", content: "Manage buyers and traders and the crates they hold." },
      { property: "og:title", content: "Parties — Narayan Dairy" },
      { property: "og:description", content: "Manage buyers and traders and the crates they hold." },
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

const EMPTY: FormState = {
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
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Party | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const save = useMutation({
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
      toast.success(`${row.party_name} saved.`);
      setOpen(false);
      setForm(EMPTY);
      setEditing(null);
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Unable to save the party. No changes were made.")),
  });

  const removeOrDeactivate = useMutation({
    mutationFn: async (party: Party) => {
      const { data, error } = await supabase.rpc("delete_party", { _party_id: party.id });
      if (error) throw error;
      return data as unknown as { action: string };
    },
    onSuccess: async (result) => {
      await invalidateAll(queryClient);
      toast.success(
        result.action === "deleted"
          ? "Party removed."
          : "Party has history, so it was set to inactive instead.",
      );
    },
    onError: (error) => toast.error(errorMessage(error, "Unable to update the party.")),
  });

  const toggleStatus = useMutation({
    mutationFn: async (party: Party) => {
      const { error } = await supabase
        .from("parties")
        .update({ status: party.status === "active" ? "inactive" : "active" })
        .eq("id", party.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await invalidateAll(queryClient);
      toast.success("Status updated.");
    },
    onError: (error) => toast.error(errorMessage(error, "Unable to update the status.")),
  });

  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
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
    setOpen(true);
  }

  const balanceOf = (id: string) => balances.data?.find((b) => b.party_id === id);

  return (
    <AppShell
      title="Parties"
      description="Buyers and traders who hold your crates."
      actions={
        <Button onClick={openNew}>
          <Plus className="size-4" /> Add party
        </Button>
      }
    >
      <div className="panel overflow-hidden">
        {parties.isLoading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : (parties.data ?? []).length === 0 ? (
          <EmptyState
            icon={Users}
            title="No parties added yet"
            description="Add a party to start tracking the crates they hold."
            action={
              <Button onClick={openNew}>
                <Plus className="size-4" /> Add party
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Party</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Issued</TableHead>
                <TableHead className="text-right">Returned</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parties.data!.map((party) => {
                const b = balanceOf(party.id);
                return (
                  <TableRow key={party.id}>
                    <TableCell className="font-medium">{party.party_name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {party.contact_person ?? "—"}
                      {party.phone ? ` · ${party.phone}` : ""}
                    </TableCell>
                    <TableCell className="num text-right">{b?.issued ?? 0}</TableCell>
                    <TableCell className="num text-right">{b?.returned ?? 0}</TableCell>
                    <TableCell className="num text-right font-semibold">{b?.balance ?? 0}</TableCell>
                    <TableCell>
                      <Badge variant={party.status === "active" ? "secondary" : "outline"}>
                        {party.status === "active" ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(party)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleStatus.mutate(party)}>
                          {party.status === "active" ? "Deactivate" : "Activate"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeOrDeactivate.mutate(party)}
                          aria-label="Remove party"
                        >
                          <Ban className="size-4" />
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit party" : "Add party"}</DialogTitle>
            <DialogDescription>Saved straight to your shared records.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="party_name">Party name</Label>
              <Input
                id="party_name"
                value={form.party_name}
                onChange={(e) => setForm({ ...form, party_name: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contact_person">Contact person</Label>
                <Input
                  id="contact_person"
                  value={form.contact_person}
                  onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="gst_number">GST number</Label>
                <Input
                  id="gst_number"
                  value={form.gst_number}
                  onChange={(e) => setForm({ ...form, gst_number: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="party_notes">Notes</Label>
              <Textarea
                id="party_notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
