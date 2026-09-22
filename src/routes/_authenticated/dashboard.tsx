import { createFileRoute, Link } from "@tanstack/react-router";
import { Boxes, Truck, Users, ArrowLeftRight, Package, AlertCircle } from "lucide-react";

import { AppShell, EmptyState } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
      { title: "Dashboard — CrateLedger" },
      { name: "description", content: "Live crate totals, outstanding balances and recent movements." },
      { property: "og:title", content: "Dashboard — CrateLedger" },
      { property: "og:description", content: "Live crate totals, outstanding balances and recent movements." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Stat({
  label,
  value,
  hint,
  loading,
  tone = "default",
}: {
  label: string;
  value: number;
  hint?: string;
  loading: boolean;
  tone?: "default" | "primary" | "warning";
}) {
  return (
    <div className="panel p-5">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-20" />
      ) : (
        <p
          className={
            "stat-figure mt-2 text-3xl font-semibold " +
            (tone === "primary"
              ? "text-primary"
              : tone === "warning"
                ? "text-warning"
                : "text-foreground")
          }
        >
          {value.toLocaleString()}
        </p>
      )}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Dashboard() {
  const stats = useDashboardStats();
  const vehicleBalances = useVehicleBalances();
  const partyBalances = usePartyBalances();
  const transactions = useTransactions(8);
  const vehicles = useVehicles();
  const parties = useParties();

  const s = stats.data;
  const loading = stats.isLoading;

  const vehicleName = (id: string | null) =>
    vehicles.data?.find((v) => v.id === id)?.vehicle_number ?? "";
  const partyName = (id: string | null) =>
    parties.data?.find((p) => p.id === id)?.party_name ?? "";

  const topVehicles = (vehicleBalances.data ?? []).filter((v) => v.balance > 0).slice(0, 5);
  const topParties = (partyBalances.data ?? []).filter((p) => p.balance > 0).slice(0, 5);

  return (
    <AppShell
      title="Dashboard"
      description="Live figures calculated from recorded crate movements."
      actions={
        <>
          <Button asChild variant="outline">
            <Link to="/inventory">Adjust stock</Link>
          </Button>
          <Button asChild>
            <Link to="/transactions">Record movement</Link>
          </Button>
        </>
      }
    >
      {!loading && s && s.total_crates === 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-border bg-secondary p-4">
          <AlertCircle className="mt-0.5 size-5 text-primary" />
          <div className="text-sm">
            <p className="font-medium">No crates recorded yet.</p>
            <p className="text-muted-foreground">
              Add the crates you own on the Inventory page before issuing any out.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Total crates" value={s?.total_crates ?? 0} loading={loading} />
        <Stat
          label="Available"
          value={s?.available ?? 0}
          loading={loading}
          tone="primary"
          hint="Ready to issue"
        />
        <Stat label="With vehicles" value={s?.with_vehicles ?? 0} loading={loading} />
        <Stat label="With parties" value={s?.with_parties ?? 0} loading={loading} />
        <Stat
          label="Outstanding"
          value={s?.outstanding ?? 0}
          loading={loading}
          tone="warning"
          hint="Yet to come back"
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Stat
          label="Vehicles"
          value={s?.vehicle_count ?? 0}
          loading={loading}
          hint={`${s?.active_vehicle_count ?? 0} active`}
        />
        <Stat
          label="Parties"
          value={s?.party_count ?? 0}
          loading={loading}
          hint={`${s?.active_party_count ?? 0} active`}
        />
        <Stat label="Movements recorded" value={s?.transaction_count ?? 0} loading={loading} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <div className="mb-4 flex items-center gap-2">
            <Truck className="size-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Crates with vehicles</h2>
          </div>
          {topVehicles.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="No crates with vehicles"
              description="Once you issue crates to a vehicle, its outstanding balance shows here."
            />
          ) : (
            <ul className="divide-y divide-border">
              {topVehicles.map((v) => (
                <li key={v.vehicle_id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">{v.vehicle_number}</p>
                    <p className="text-xs text-muted-foreground">{v.driver_name ?? "No driver"}</p>
                  </div>
                  <span className="num font-display text-lg font-semibold">{v.balance}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel p-5">
          <div className="mb-4 flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Crates with parties</h2>
          </div>
          {topParties.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No crates with parties"
              description="Issue crates to a party and their outstanding balance appears here."
            />
          ) : (
            <ul className="divide-y divide-border">
              {topParties.map((p) => (
                <li key={p.party_id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">{p.party_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.contact_person ?? "No contact"}
                    </p>
                  </div>
                  <span className="num font-display text-lg font-semibold">{p.balance}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="panel mt-6 p-5">
        <div className="mb-4 flex items-center gap-2">
          <ArrowLeftRight className="size-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Latest movements</h2>
        </div>
        {(transactions.data ?? []).length === 0 ? (
          <EmptyState
            icon={Package}
            title="No transactions recorded yet"
            description="Issues and returns will be listed here as they happen."
            action={
              <Button asChild>
                <Link to="/transactions">Record a movement</Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {transactions.data!.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {t.vehicle_id ? vehicleName(t.vehicle_id) : partyName(t.party_id)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(t.transaction_date).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {t.is_reversal && <Badge variant="outline">Reversal</Badge>}
                  <Badge variant={t.transaction_type === "ISSUED" ? "default" : "secondary"}>
                    {t.transaction_type === "ISSUED" ? "Issued" : "Returned"}
                  </Badge>
                  <span className="num font-display font-semibold">{t.quantity}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <Boxes className="size-3.5" /> Figures update automatically when anyone on your team records
        a movement.
      </p>
    </AppShell>
  );
}
