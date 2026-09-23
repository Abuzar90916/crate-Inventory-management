import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Truck,
  Users,
  Package,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeSync } from "@/lib/crates";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/vehicles", label: "Vehicles", icon: Truck },
  { to: "/parties", label: "Parties", icon: Users },
  { to: "/inventory", label: "Inventory", icon: Package },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  useRealtimeSync();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [userId, setUserId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user) return;
      const metaName = user.user_metadata?.username as string | undefined;
      if (metaName) {
        setUserId(metaName.toUpperCase());
      } else if (user.email) {
        const prefix = user.email.split("@")[0].toUpperCase();
        setUserId(prefix);
      } else {
        setUserId("Staff");
      }
    });
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function signOut() {
    await supabase.auth.signOut();
    await navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[16rem_1fr]">
      <aside
        className={cn(
          "bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col border-r border-sidebar-border",
          open ? "flex flex-col" : "hidden lg:flex",
        )}
      >
        {/* Brand header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-sidebar-border">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white p-1"
            style={{ boxShadow: "0 1px 4px oklch(0.20 0.08 255 / 0.25)" }}
          >
            <img
              src="/narayan-dairy-logo.svg"
              alt="Narayan Dairy"
              className="h-full w-full rounded-full object-contain"
            />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight tracking-tight text-sidebar-foreground">
              NARAYAN DAIRY
            </p>
            <p className="text-xs leading-tight font-medium text-sidebar-accent-foreground/90">
              Crate Management
            </p>
          </div>
        </div>

        {/* Navigation items */}
        <nav className="flex-1 space-y-1 px-3 pt-4">
          {NAV.map(({ to, label, icon: Icon }) => {
            const isActive = pathname === to || pathname.startsWith(`${to}/`);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-xs font-semibold"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className={cn("size-4 shrink-0", isActive ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/60")} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer profile & logout */}
        <div className="border-t border-sidebar-border px-4 py-4 bg-sidebar/50">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="size-4 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-sidebar-foreground truncate">
                User ID: {userId ?? "Loading…"}
              </p>
              <p className="text-[10px] text-sidebar-foreground/60">Demo Session · Shared DB</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-sidebar-border bg-sidebar px-3 py-1.5 text-xs font-medium text-sidebar-foreground hover:bg-destructive/15 hover:text-destructive hover:border-destructive/30 transition-colors"
          >
            <LogOut className="size-3.5" /> Logout
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-card px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle navigation"
            >
              <Menu className="size-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">{title}</h1>
              {description && (
                <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
              )}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
        <main className="flex-1 px-5 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof LayoutDashboard;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-14 text-center bg-card">
      <div className="rounded-full bg-muted p-3">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <h3 className="mt-3 font-display text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
