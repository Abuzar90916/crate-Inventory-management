import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Truck,
  Plus,
  Pencil,
  Ban,
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  Calendar,
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
  recordVehicleMovement,
  useDashboardStats,
  useVehicleBalances,
  useVehicles,
  type Vehicle,
  type VehicleBalance,
} from "@/lib/crates";

export const Route = createFileRoute("/_authenticated/vehicles")({
  head: () => ({
    meta: [
      { title: "Vehicles — Narayan Dairy Crate Management" },
      { name: "description", content: "Manage vehicles and record IN and OUT crate movements." },
      { property: "og:title", content: "Vehicles — Narayan Dairy Crate Management" },
      {
        property: "og:description",
        content: "Manage vehicles and record IN and OUT crate movements.",
      },
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

const EMPTY_FORM: FormState = {
  vehicle_number: "",
  driver_name: "",
  driver_phone: "",
  notes: "",
};

function VehiclesPage() {
  const queryClient = useQueryClient();
  const vehicles = useVehicles();
  const balances = useVehicleBalances();
  const stats = useDashboardStats();

  // Add / Edit vehicle state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Detail inspection card
  const [inspectVehicle, setInspectVehicle] = useState<Vehicle | null>(null);

  // IN / OUT Movement Modal State
  const [movementModal, setMovementModal] = useState<{
    open: boolean;
    type: "IN" | "OUT";
    vehicle: Vehicle | null;
  }>({
    open: false,
    type: "OUT",
    vehicle: null,
  });

  const [quantity, setQuantity] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const availableInventory = stats.data?.available ?? 0;

  function balanceOf(id: string): VehicleBalance | undefined {
    return balances.data?.find((b) => b.vehicle_id === id);
  }

  // Save Vehicle Mutation
  const saveVehicle = useMutation({
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
      toast.success(`Vehicle ${row.vehicle_number} saved.`);
      setModalOpen(false);
      setForm(EMPTY_FORM);
      setEditing(null);
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Unable to save vehicle. Check your connection.")),
  });

  // Toggle status
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
      toast.success("Vehicle status updated.");
    },
    onError: (error) => toast.error(errorMessage(error, "Unable to update status.")),
  });

  // Movement Mutation
  const submitMovement = useMutation({
    mutationFn: async () => {
      if (!movementModal.vehicle) throw new Error("No vehicle selected.");
      const qty = parseInt(quantity, 10);
      const currentBalance = balanceOf(movementModal.vehicle.id)?.balance ?? 0;

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
            `Cannot receive ${qty} crates. This vehicle currently has only ${currentBalance} crates.`,
          );
        }
      }

      return recordVehicleMovement({
        vehicleId: movementModal.vehicle.id,
        type: movementModal.type,
        quantity: qty,
        notes: notes.trim() || undefined,
        date,
        currentVehicleBalance: currentBalance,
        availableInventory,
      });
    },
    onSuccess: async () => {
      await invalidateAll(queryClient);
      const isOut = movementModal.type === "OUT";
      toast.success(
        isOut
          ? `Issued ${quantity} crates to ${movementModal.vehicle?.vehicle_number} (VEHICLE_OUT)`
          : `Received ${quantity} crates from ${movementModal.vehicle?.vehicle_number} (VEHICLE_IN)`,
      );
      closeMovementModal();
    },
    onError: (err: any) => {
      const msg = err.message || "Movement failed.";
      setValidationError(msg);
      toast.error(msg);
    },
  });

  function openMovement(vehicle: Vehicle, type: "IN" | "OUT") {
    setMovementModal({ open: true, type, vehicle });
    setQuantity("");
    setDate(new Date().toISOString().split("T")[0]);
    setNotes("");
    setValidationError(null);
  }

  function closeMovementModal() {
    setMovementModal({ open: false, type: "OUT", vehicle: null });
    setQuantity("");
    setNotes("");
    setValidationError(null);
  }

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(vehicle: Vehicle) {
    setEditing(vehicle);
    setForm({
      vehicle_number: vehicle.vehicle_number,
      driver_name: vehicle.driver_name ?? "",
      driver_phone: vehicle.driver_phone ?? "",
      notes: vehicle.notes ?? "",
    });
    setModalOpen(true);
  }

  const activeVehicleList = vehicles.data ?? [];

  return (
    <AppShell
      title="Vehicles"
      description="Vehicles that carry crates OUT of the dairy and bring crates back IN."
      actions={
        <Button onClick={openNew} className="gap-2">
          <Plus className="size-4" /> Add Vehicle
        </Button>
      }
    >
      {/* Detail Card if selected */}
      {inspectVehicle && (
        <div className="panel mb-6 border-2 border-primary/20 bg-primary/5 p-6 transition-all">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold tracking-wider text-primary uppercase">
                Vehicle Details
              </span>
              <h2 className="mt-1 font-mono text-2xl font-bold text-foreground">
                {inspectVehicle.vehicle_number}
              </h2>
              <p className="text-xs text-muted-foreground">
                Driver: {inspectVehicle.driver_name || "Unassigned"}
                {inspectVehicle.driver_phone ? ` · ${inspectVehicle.driver_phone}` : ""}
              </p>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-right">
                <span className="text-xs font-medium text-muted-foreground uppercase">
                  Current Crates
                </span>
                <p className="stat-figure text-3xl font-bold text-primary">
                  {balanceOf(inspectVehicle.id)?.balance ?? 0}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={() => openMovement(inspectVehicle, "IN")}
                  className="h-11 bg-emerald-600 px-5 text-sm font-bold text-white hover:bg-emerald-700 shadow-sm"
                >
                  <ArrowDownLeft className="mr-1.5 size-4 stroke-[3]" /> [ IN ]
                </Button>
                <Button
                  onClick={() => openMovement(inspectVehicle, "OUT")}
                  className="h-11 bg-blue-700 px-5 text-sm font-bold text-white hover:bg-blue-800 shadow-sm"
                >
                  <ArrowUpRight className="mr-1.5 size-4 stroke-[3]" /> [ OUT ]
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setInspectVehicle(null)}
                  className="text-xs text-muted-foreground"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Vehicles Table Panel */}
      <div className="panel overflow-hidden">
        {vehicles.isLoading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : activeVehicleList.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="No vehicles added yet"
            description="Add your first vehicle (e.g. MH04AB1234) to start issuing and receiving crates."
            action={
              <Button onClick={openNew}>
                <Plus className="size-4" /> Add Vehicle
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="font-bold">Vehicle Number</TableHead>
                <TableHead className="font-bold">Driver</TableHead>
                <TableHead className="text-right font-bold">Current Crates</TableHead>
                <TableHead className="text-center font-bold">Status</TableHead>
                <TableHead className="text-right font-bold">Actions (IN / OUT)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeVehicleList.map((vehicle) => {
                const b = balanceOf(vehicle.id);
                const currentBalance = b?.balance ?? 0;
                return (
                  <TableRow
                    key={vehicle.id}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <TableCell className="font-mono text-base font-bold text-foreground">
                      <button
                        onClick={() => setInspectVehicle(vehicle)}
                        className="hover:underline text-left"
                      >
                        {vehicle.vehicle_number}
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <div className="text-sm font-medium text-foreground">
                        {vehicle.driver_name || "—"}
                      </div>
                      {vehicle.driver_phone && (
                        <div className="text-xs text-muted-foreground">{vehicle.driver_phone}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-mono text-lg font-bold text-primary">
                        {currentBalance.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={vehicle.status === "active" ? "secondary" : "outline"}
                        className={
                          vehicle.status === "active"
                            ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                            : ""
                        }
                      >
                        {vehicle.status === "active" ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Prominent IN button */}
                        <Button
                          size="sm"
                          onClick={() => openMovement(vehicle, "IN")}
                          className="bg-emerald-600 font-bold text-white hover:bg-emerald-700 h-8 px-3 shadow-xs"
                          title="Vehicle IN: crates coming into dairy from vehicle"
                        >
                          <ArrowDownLeft className="size-3.5 mr-1 stroke-[3]" /> [ IN ]
                        </Button>

                        {/* Prominent OUT button */}
                        <Button
                          size="sm"
                          onClick={() => openMovement(vehicle, "OUT")}
                          className="bg-blue-700 font-bold text-white hover:bg-blue-800 h-8 px-3 shadow-xs"
                          title="Vehicle OUT: crates going out of dairy to vehicle"
                        >
                          <ArrowUpRight className="size-3.5 mr-1 stroke-[3]" /> [ OUT ]
                        </Button>

                        {/* Quick edit */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground"
                          onClick={() => openEdit(vehicle)}
                          title="Edit vehicle"
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
                  {movementModal.type === "IN" ? "Vehicle IN (Receiving Crates)" : "Vehicle OUT (Issuing Crates)"}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {movementModal.type === "IN"
                    ? "Crates are coming INTO the business FROM the vehicle."
                    : "Crates are going OUT OF THE BUSINESS TO the vehicle."}
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
            {/* Vehicle info strip */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-3">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-medium">Vehicle</p>
                <p className="font-mono text-base font-bold text-foreground">
                  {movementModal.vehicle?.vehicle_number}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-muted-foreground uppercase font-medium">
                  {movementModal.type === "IN" ? "Vehicle Current Balance" : "Available Stock"}
                </p>
                <p className="font-mono text-base font-bold text-primary">
                  {movementModal.type === "IN"
                    ? `${balanceOf(movementModal.vehicle?.id ?? "")?.balance ?? 0} crates`
                    : `${availableInventory.toLocaleString()} crates`}
                </p>
              </div>
            </div>

            {/* Quantity */}
            <div className="space-y-1.5">
              <Label htmlFor="qty" className="text-sm font-semibold">
                Quantity (Crates)
              </Label>
              <Input
                id="qty"
                type="number"
                min="1"
                step="1"
                required
                autoFocus
                placeholder="e.g. 100"
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value.replace(/[^0-9]/g, ""));
                  setValidationError(null);
                }}
                className="h-11 font-mono text-lg font-bold"
              />
              <p className="text-[11px] text-muted-foreground">
                {movementModal.type === "IN"
                  ? `Max receivable: ${balanceOf(movementModal.vehicle?.id ?? "")?.balance ?? 0}`
                  : `Max available to issue: ${availableInventory}`}
              </p>
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <Label htmlFor="tx-date" className="text-sm font-medium">
                Date
              </Label>
              <Input
                id="tx-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-10 text-sm"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-sm font-medium">
                Notes
              </Label>
              <Textarea
                id="notes"
                placeholder={
                  movementModal.type === "IN"
                    ? "e.g. Returned crates from morning distribution"
                    : "e.g. Dispatched for daily delivery route"
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
                "Confirm Vehicle IN"
              ) : (
                "Confirm Vehicle OUT"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Vehicle Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Vehicle" : "Add Vehicle"}</DialogTitle>
            <DialogDescription>
              Vehicle information is shared in real time across all operators.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="v_num">Vehicle Number *</Label>
              <Input
                id="v_num"
                placeholder="e.g. MH04AB1234"
                value={form.vehicle_number}
                onChange={(e) =>
                  setForm((f) => ({ ...f, vehicle_number: e.target.value.toUpperCase() }))
                }
                className="font-mono uppercase font-bold"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="d_name">Driver Name</Label>
              <Input
                id="d_name"
                placeholder="e.g. Ramesh Patil"
                value={form.driver_name}
                onChange={(e) => setForm((f) => ({ ...f, driver_name: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="d_phone">Driver Phone</Label>
              <Input
                id="d_phone"
                placeholder="e.g. 9876543210"
                value={form.driver_phone}
                onChange={(e) => setForm((f) => ({ ...f, driver_phone: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="v_notes">Notes</Label>
              <Textarea
                id="v_notes"
                placeholder="Optional vehicle notes"
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
            <Button onClick={() => saveVehicle.mutate()} disabled={saveVehicle.isPending}>
              {saveVehicle.isPending ? "Saving…" : "Save Vehicle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
