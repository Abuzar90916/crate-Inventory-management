import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Truck,
  Users,
  Package,
  Layers,
  CheckCircle2,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useDashboardStats,
  usePartyBalances,
  useTransactions,
  useVehicleBalances,
  useVehicles,
  useParties,
} from "@/lib/crates";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Narayan Dairy Crate Management" },
      { name: "description", content: "Live crate totals, outstanding balances and recent movements." },
      { property: "og:title", content: "Dashboard — Narayan Dairy Crate Management" },
      {
        property: "og:description",
        content: "Live crate totals, outstanding balances and recent movements.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function MetricCard({
  label,
  value,
  sublabel,
  icon: Icon,
  loading,
  tone = "default",
}: {
  label: string;
  value: number;
  sublabel?: string;
  icon: any;
  loading: boolean;
  tone?: "default" | "primary" | "success" | "accent";
}) {
  const toneClasses = {
    default: "text-foreground bg-card border-border",
    primary: "text-primary bg-primary/5 border-primary/20",
    success: "text-emerald-700 bg-emerald-500/5 border-emerald-500/20",
    accent: "text-blue-700 bg-blue-500/5 border-blue-500/20",
  };

  const iconBgClasses = {
    default: "bg-muted text-muted-foreground",
    primary: "bg-primary/10 text-primary",
    success: "bg-emerald-100 text-emerald-700",
    accent: "bg-blue-100 text-blue-700",
  };

  return (
    <div className={`panel p-5 border transition-all ${toneClasses[tone]}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBgClasses[tone]}`}>
          <Icon className="size-5" />
        </div>
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-9 w-24" />
      ) : (
        <p className="stat-figure mt-2 font-mono text-3xl font-bold">
          {value.toLocaleString()}
        </p>
      )}
      {sublabel && <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>}
    </div>
  );
}

function Dashboard() {
  const stats = useDashboardStats();
  const vehicleBalances = useVehicleBalances();
  const partyBalances = usePartyBalances();
  const transactions = useTransactions(10);
  const vehicles = useVehicles();
  const parties = useParties();

  const s = stats.data;
  const loading = stats.isLoading;

  const vehicleName = (id: string | null) =>
    vehicles.data?.find((v) => v.id === id)?.vehicle_number ?? "Vehicle";
  const partyName = (id: string | null) =>
    parties.data?.find((p) => p.id === id)?.party_name ?? "Party";

  return (
    <AppShell
      title="Dashboard"
      description="Real-time shared inventory and crate status across Narayan Dairy."
      actions={
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/inventory">Stock & Adjustments</Link>
          </Button>
          <Button asChild size="sm" className="bg-primary hover:bg-primary/90">
            <Link to="/vehicles">Manage Vehicles</Link>
          </Button>
          <Button asChild size="sm" className="bg-blue-700 hover:bg-blue-800 text-white">
            <Link to="/parties">Manage Parties</Link>
          </Button>
        </div>
      }
    >
      {/* 4 Primary Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Crates"
          value={s?.total_crates ?? 0}
          sublabel="Total owned dairy inventory"
          icon={Layers}
          loading={loading}
          tone="default"
        />
        <MetricCard
          label="Available Crates"
          value={s?.available ?? 0}
          sublabel="Crates in dairy ready to issue"
          icon={CheckCircle2}
          loading={loading}
          tone="success"
        />
        <MetricCard
          label="Crates With Vehicles"
          value={s?.with_vehicles ?? 0}
          sublabel="Outstanding on delivery vehicles"
          icon={Truck}
          loading={loading}
          tone="accent"
        />
        <MetricCard
          label="Crates With Parties"
          value={s?.with_parties ?? 0}
          sublabel="Outstanding with buyers / traders"
          icon={Users}
          loading={loading}
          tone="primary"
        />
      </div>

      {/* 2 Secondary Summary Cards */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="panel p-5 flex items-center justify-between border bg-card">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Truck className="size-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">Total Vehicles</p>
              <p className="font-mono text-2xl font-bold text-foreground">
                {loading ? "…" : s?.vehicle_count ?? 0}
              </p>
            </div>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/vehicles" className="text-xs font-semibold text-primary">
              View Vehicles →
            </Link>
          </Button>
        </div>

        <div className="panel p-5 flex items-center justify-between border bg-card">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Users className="size-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">Total Parties</p>
              <p className="font-mono text-2xl font-bold text-foreground">
                {loading ? "…" : s?.party_count ?? 0}
              </p>
            </div>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/parties" className="text-xs font-semibold text-primary">
              View Parties →
            </Link>
          </Button>
        </div>
      </div>

      {/* Active Balances Overview */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Vehicles Balances */}
        <div className="panel overflow-hidden border">
          <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Truck className="size-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground">Vehicles with Crates</h2>
            </div>
            <Link to="/vehicles" className="text-xs font-semibold text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="p-0">
            {(vehicleBalances.data ?? []).filter((v) => v.balance > 0).length === 0 ? (
              <p className="p-6 text-center text-xs text-muted-foreground">
                No vehicles currently hold crates.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs font-semibold">Vehicle</TableHead>
                    <TableHead className="text-xs font-semibold">Driver</TableHead>
                    <TableHead className="text-right text-xs font-semibold">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(vehicleBalances.data ?? [])
                    .filter((v) => v.balance > 0)
                    .slice(0, 5)
                    .map((v) => (
                      <TableRow key={v.vehicle_id}>
                        <TableCell className="font-mono text-sm font-bold text-foreground">
                          {v.vehicle_number}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {v.driver_name || "—"}
                        </TableCell>
                        <TableCell className="font-mono text-right text-sm font-bold text-primary">
                          {v.balance}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>

        {/* Parties Balances */}
        <div className="panel overflow-hidden border">
          <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground">Parties with Crates</h2>
            </div>
            <Link to="/parties" className="text-xs font-semibold text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="p-0">
            {(partyBalances.data ?? []).filter((p) => p.balance > 0).length === 0 ? (
              <p className="p-6 text-center text-xs text-muted-foreground">
                No parties currently hold crates.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs font-semibold">Party Name</TableHead>
                    <TableHead className="text-xs font-semibold">Contact</TableHead>
                    <TableHead className="text-right text-xs font-semibold">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(partyBalances.data ?? [])
                    .filter((p) => p.balance > 0)
                    .slice(0, 5)
                    .map((p) => (
                      <TableRow key={p.party_id}>
                        <TableCell className="text-sm font-semibold text-foreground">
                          {p.party_name}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {p.contact_person || "—"}
                        </TableCell>
                        <TableCell className="font-mono text-right text-sm font-bold text-primary">
                          {p.balance}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </div>

      {/* Live Movement Log */}
      <div className="mt-6 panel overflow-hidden border">
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Package className="size-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">Recent Crate Movements (Live)</h2>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Realtime Synced
          </span>
        </div>

        {(transactions.data ?? []).length === 0 ? (
          <p className="p-8 text-center text-xs text-muted-foreground">
            No crate movements recorded yet. Issue or receive crates from Vehicles or Parties.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs font-semibold">When</TableHead>
                <TableHead className="text-xs font-semibold">Movement</TableHead>
                <TableHead className="text-xs font-semibold">Vehicle / Party</TableHead>
                <TableHead className="text-right text-xs font-semibold">Quantity</TableHead>
                <TableHead className="text-xs font-semibold">Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(transactions.data ?? []).map((tx) => {
                const isOut =
                  tx.transaction_type === "VEHICLE_OUT" ||
                  tx.transaction_type === "PARTY_OUT" ||
                  tx.transaction_type === "ISSUED";

                const isVehicle = !!tx.vehicle_id;
                const entityName = isVehicle ? vehicleName(tx.vehicle_id) : partyName(tx.party_id);

                return (
                  <TableRow key={tx.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(tx.transaction_date).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          isOut
                            ? "border-blue-500/30 bg-blue-500/10 text-blue-700 font-mono text-[11px]"
                            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 font-mono text-[11px]"
                        }
                      >
                        {isOut ? (
                          <ArrowUpRight className="mr-1 size-3 text-blue-600" />
                        ) : (
                          <ArrowDownLeft className="mr-1 size-3 text-emerald-600" />
                        )}
                        {tx.transaction_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-foreground">
                      {entityName}
                    </TableCell>
                    <TableCell className="font-mono text-right text-sm font-bold">
                      <span className={isOut ? "text-blue-700" : "text-emerald-700"}>
                        {isOut ? "−" : "+"}
                        {tx.quantity}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                      {tx.notes || "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </AppShell>
  );
}
