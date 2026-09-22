import { createFileRoute } from "@tanstack/react-router";
import { FileBarChart, Download } from "lucide-react";

import { AppShell, EmptyState } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
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

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports — CrateLedger" },
      { name: "description", content: "Outstanding crates by holder with CSV export." },
      { property: "og:title", content: "Reports — CrateLedger" },
      { property: "og:description", content: "Outstanding crates by holder with CSV export." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReportsPage,
});

function toCsv(rows: (string | number)[][]) {
  return rows
    .map((row) =>
      row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","),
    )
    .join("\n");
}

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function ReportsPage() {
  const stats = useDashboardStats();
  const vehicleBalances = useVehicleBalances();
  const partyBalances = usePartyBalances();
  const transactions = useTransactions(1000);
  const vehicles = useVehicles();
  const parties = useParties();

  const outstandingVehicles = (vehicleBalances.data ?? []).filter((v) => v.balance !== 0);
  const outstandingParties = (partyBalances.data ?? []).filter((p) => p.balance !== 0);

  function exportOutstanding() {
    const rows: (string | number)[][] = [["Holder type", "Holder", "Issued", "Returned", "Outstanding"]];
    outstandingVehicles.forEach((v) =>
      rows.push(["Vehicle", v.vehicle_number, v.issued, v.returned, v.balance]),
    );
    outstandingParties.forEach((p) =>
      rows.push(["Party", p.party_name, p.issued, p.returned, p.balance]),
    );
    download("outstanding-crates.csv", toCsv(rows));
  }

  function exportMovements() {
    const rows: (string | number)[][] = [["Date", "Holder type", "Holder", "Type", "Crates", "Notes"]];
    (transactions.data ?? []).forEach((t) => {
      const holder = t.vehicle_id
        ? (vehicles.data?.find((v) => v.id === t.vehicle_id)?.vehicle_number ?? "")
        : (parties.data?.find((p) => p.id === t.party_id)?.party_name ?? "");
      rows.push([
        new Date(t.transaction_date).toISOString(),
        t.vehicle_id ? "Vehicle" : "Party",
        holder,
        t.transaction_type,
        t.quantity,
        t.notes ?? "",
      ]);
    });
    download("crate-movements.csv", toCsv(rows));
  }

  const s = stats.data;
  const hasData = (s?.transaction_count ?? 0) > 0;

  return (
    <AppShell
      title="Reports"
      description="Where your crates are, straight from the recorded movements."
      actions={
        <>
          <Button variant="outline" onClick={exportOutstanding} disabled={!hasData}>
            <Download className="size-4" /> Outstanding
          </Button>
          <Button onClick={exportMovements} disabled={!hasData}>
            <Download className="size-4" /> All movements
          </Button>
        </>
      }
    >
      {!hasData ? (
        <EmptyState
          icon={FileBarChart}
          title="No transactions recorded yet"
          description="Reports appear as soon as crates start moving."
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              { label: "Total crates", value: s?.total_crates ?? 0 },
              { label: "Outstanding", value: s?.outstanding ?? 0 },
              { label: "With vehicles", value: s?.with_vehicles ?? 0 },
              { label: "With parties", value: s?.with_parties ?? 0 },
            ].map((item) => (
              <div key={item.label} className="panel p-5">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {item.label}
                </p>
                <p className="stat-figure mt-2 text-2xl font-semibold">
                  {item.value.toLocaleString()}
                </p>
              </div>
            ))}
          </div>

          <section className="panel overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold">Outstanding by holder</h2>
            </div>
            {outstandingVehicles.length === 0 && outstandingParties.length === 0 ? (
              <EmptyState
                icon={FileBarChart}
                title="Everything is back"
                description="No vehicle or party is holding crates right now."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Holder</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Issued</TableHead>
                    <TableHead className="text-right">Returned</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead>Last activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outstandingVehicles.map((v) => (
                    <TableRow key={v.vehicle_id}>
                      <TableCell className="font-medium">{v.vehicle_number}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">Vehicle</Badge>
                      </TableCell>
                      <TableCell className="num text-right">{v.issued}</TableCell>
                      <TableCell className="num text-right">{v.returned}</TableCell>
                      <TableCell className="num text-right font-semibold">{v.balance}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {v.last_activity ? new Date(v.last_activity).toLocaleDateString() : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {outstandingParties.map((p) => (
                    <TableRow key={p.party_id}>
                      <TableCell className="font-medium">{p.party_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">Party</Badge>
                      </TableCell>
                      <TableCell className="num text-right">{p.issued}</TableCell>
                      <TableCell className="num text-right">{p.returned}</TableCell>
                      <TableCell className="num text-right font-semibold">{p.balance}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.last_activity ? new Date(p.last_activity).toLocaleDateString() : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
