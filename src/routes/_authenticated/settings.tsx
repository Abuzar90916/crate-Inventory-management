import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldCheck, LogOut, Database, Users, Radio } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Narayan Dairy Crate Management" },
      { name: "description", content: "System and account settings for Narayan Dairy." },
      { property: "og:title", content: "Settings — Narayan Dairy Crate Management" },
      {
        property: "og:description",
        content: "System and account settings for Narayan Dairy.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

const DEMO_USERS = [
  { id: "122AX019", role: "Manager / Staff", pass: "123456" },
  { id: "122AX020", role: "Staff Operator", pass: "123456" },
  { id: "122AX021", role: "Staff Operator", pass: "123456" },
  { id: "122AX022", role: "Staff Operator", pass: "123456" },
];

function SettingsPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string>("Loading…");

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (user) {
        const meta = user.user_metadata?.username as string | undefined;
        if (meta) {
          setUserId(meta.toUpperCase());
        } else if (user.email) {
          setUserId(user.email.split("@")[0].toUpperCase());
        }
      }
    });
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    toast.success("Logged out successfully");
    await navigate({ to: "/auth" });
  }

  return (
    <AppShell
      title="Settings"
      description="System status, active demo session, and shared database information."
    >
      <div className="max-w-4xl space-y-6">
        {/* Active Session */}
        <div className="panel p-6">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ShieldCheck className="size-6" />
              </div>
              <div>
                <h2 className="text-base font-semibold">Active Session</h2>
                <p className="text-xs text-muted-foreground">
                  Current authenticated operator session
                </p>
              </div>
            </div>
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 bg-emerald-500/10">
              ● Connected
            </Badge>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted/30 p-3.5">
              <p className="text-xs text-muted-foreground">Logged-in User ID</p>
              <p className="mt-1 font-mono text-lg font-bold text-foreground">{userId}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3.5">
              <p className="text-xs text-muted-foreground">Database Scope</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                Shared Supabase Database
              </p>
              <p className="text-xs text-muted-foreground">All operators share live data</p>
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <Button variant="destructive" size="sm" onClick={handleSignOut} className="gap-2">
              <LogOut className="size-4" /> Logout Session
            </Button>
          </div>
        </div>

        {/* Demo Credentials Guide */}
        <div className="panel p-6">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Users className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Demo Operator Accounts</h2>
              <p className="text-xs text-muted-foreground">
                Fixed credentials for pair-testing multi-user live synchronization
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {DEMO_USERS.map((u) => {
              const isCurrent = u.id === userId;
              return (
                <div
                  key={u.id}
                  className={`rounded-lg border p-3.5 transition-colors ${
                    isCurrent
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-foreground">{u.id}</span>
                    {isCurrent ? (
                      <Badge variant="default" className="text-[10px]">Active</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">{u.role}</Badge>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Password:</span>
                    <span className="font-mono">{u.pass}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* System & Architecture Info */}
        <div className="panel p-6">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700">
              <Database className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">System & Architecture</h2>
              <p className="text-xs text-muted-foreground">
                Narayan Dairy Crate Management specifications
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3 text-xs text-muted-foreground">
            <div className="flex items-center justify-between py-1.5 border-b border-border/50">
              <span className="flex items-center gap-2">
                <Radio className="size-3.5 text-emerald-500 animate-pulse" />
                Real-Time Synchronization
              </span>
              <span className="font-medium text-foreground">Supabase Realtime (Active)</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-border/50">
              <span>Database Engine</span>
              <span className="font-medium text-foreground">PostgreSQL (Supabase Cloud)</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-border/50">
              <span>Movement Types</span>
              <span className="font-mono font-medium text-foreground">VEHICLE_IN · VEHICLE_OUT · PARTY_IN · PARTY_OUT</span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span>Application Version</span>
              <span className="font-medium text-foreground">1.0.0 (Production)</span>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
