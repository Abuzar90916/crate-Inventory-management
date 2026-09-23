import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Truck, Plus, Pencil, Ban, Loader2 } from "lucide-react";
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
import { errorMessage, invalidateAll, useVehicleBalances, useVehicles, type Vehicle } from "@/lib/crates";

export const Route = createFileRoute("/_authenticated/vehicles")({
  head: () => ({
    meta: [
      { title: "Vehicles — Narayan Dairy" },
      { name: "description", content: "Manage vehicles and see how many crates each one holds." },
      { property: "og:title", content: "Vehicles — Narayan Dairy" },
      { property: "og:description", content: "Manage vehicles and see how many crates each one holds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VehiclesPage,
});

type FormState = {
  vehicle_number: string;
  driver_name: string;
  driver_phone: string;
  notes: string;
};

const EMPTY: FormState = { vehicle_number: "", driver_name: "", driver_phone: "", notes: "" };

function VehiclesPage() {
  const queryClient = useQueryClient();
  const vehicles = useVehicles();
  const balances = useVehicleBalances();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        vehicle_number: form.vehicle_number.trim().toUpperCase(),
        driver_name: form.driver_name.trim() || null,
        driver_phone: form.driver_phone.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (!payload.vehicle_number) throw new Error("Vehicle number is required.");

      if (editing) {
        const { data, error } = await supabase
          .from("vehicles")
          .update(payload)
          .eq("id", editing.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from("vehicles").insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (row) => {
      await invalidateAll(queryClient);
      toast.success(`${row.vehicle_number} saved.`);
      setOpen(false);
      setForm(EMPTY);
      setEditing(null);
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Unable to save the vehicle. No changes were made.")),
  });

  const removeOrDeactivate = useMutation({
    mutationFn: async (vehicle: Vehicle) => {
      const { data, error } = await supabase.rpc("delete_vehicle", { _vehicle_id: vehicle.id });
      if (error) throw error;
      return data as unknown as { action: string };
    },
    onSuccess: async (result) => {
      await invalidateAll(queryClient);
      toast.success(
        result.action === "deleted"
          ? "Vehicle removed."
          : "Vehicle has history, so it was set to inactive instead.",
      );
    },
    onError: (error) => toast.error(errorMessage(error, "Unable to update the vehicle.")),
  });

  const toggleStatus = useMutation({
    mutationFn: async (vehicle: Vehicle) => {
      const { error } = await supabase
        .from("vehicles")
        .update({ status: vehicle.status === "active" ? "inactive" : "active" })
        .eq("id", vehicle.id);
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

  function openEdit(vehicle: Vehicle) {
    setEditing(vehicle);
    setForm({
      vehicle_number: vehicle.vehicle_number,
      driver_name: vehicle.driver_name ?? "",
      driver_phone: vehicle.driver_phone ?? "",
      notes: vehicle.notes ?? "",
    });
    setOpen(true);
  }

  const balanceOf = (id: string) => balances.data?.find((b) => b.vehicle_id === id);

  return (
    <AppShell
      title="Vehicles"
      description="Vehicles that carry crates out and bring them back."
      actions={
        <Button onClick={openNew}>
          <Plus className="size-4" /> Add vehicle
        </Button>
      }
    >
      <div className="panel overflow-hidden">
        {vehicles.isLoading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : (vehicles.data ?? []).length === 0 ? (
          <EmptyState
            icon={Truck}
            title="No vehicles added yet"
            description="Add your first vehicle to start issuing crates against it."
            action={
              <Button onClick={openNew}>
                <Plus className="size-4" /> Add vehicle
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vehicle</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead className="text-right">Issued</TableHead>
                <TableHead className="text-right">Returned</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicles.data!.map((vehicle) => {
                const b = balanceOf(vehicle.id);
                return (
                  <TableRow key={vehicle.id}>
                    <TableCell className="font-medium">{vehicle.vehicle_number}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {vehicle.driver_name ?? "—"}
                      {vehicle.driver_phone ? ` · ${vehicle.driver_phone}` : ""}
                    </TableCell>
                    <TableCell className="num text-right">{b?.issued ?? 0}</TableCell>
                    <TableCell className="num text-right">{b?.returned ?? 0}</TableCell>
                    <TableCell className="num text-right font-semibold">{b?.balance ?? 0}</TableCell>
                    <TableCell>
                      <Badge variant={vehicle.status === "active" ? "secondary" : "outline"}>
                        {vehicle.status === "active" ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(vehicle)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleStatus.mutate(vehicle)}
                        >
                          {vehicle.status === "active" ? "Deactivate" : "Activate"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeOrDeactivate.mutate(vehicle)}
                          aria-label="Remove vehicle"
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
            <DialogTitle>{editing ? "Edit vehicle" : "Add vehicle"}</DialogTitle>
            <DialogDescription>
              Saved straight to your shared records — everyone sees it immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="vehicle_number">Vehicle number</Label>
              <Input
                id="vehicle_number"
                value={form.vehicle_number}
                onChange={(e) => setForm({ ...form, vehicle_number: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="driver_name">Driver name</Label>
                <Input
                  id="driver_name"
                  value={form.driver_name}
                  onChange={(e) => setForm({ ...form, driver_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="driver_phone">Driver phone</Label>
                <Input
                  id="driver_phone"
                  value={form.driver_phone}
                  onChange={(e) => setForm({ ...form, driver_phone: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
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
