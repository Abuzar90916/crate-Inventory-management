import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Truck,
  Users,
  ArrowLeftRight,
  Package,
  FileBarChart,
  LogOut,
  Menu,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeSync } from "@/lib/crates";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/vehicles", label: "Vehicles", icon: Truck },
  { to: "/parties", label: "Parties", icon: Users },
  { to: "/transactions", label: "Movements", icon: ArrowLeftRight },
  { to: "/inventory", label: "Inventory", icon: Package },
  { to: "/reports", label: "Reports", icon: FileBarChart },
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
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
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
          "bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col",
          open ? "flex flex-col" : "hidden lg:flex",
        )}
      >
        {/* Brand header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-sidebar-border">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white"
            style={{ boxShadow: "0 1px 4px oklch(0.20 0.08 255 / 0.30)" }}
          >
            <img
              src="/narayan-dairy-logo.svg"
              alt="Narayan Dairy"
              className="h-9 w-9 rounded-full object-contain"
            />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight text-sidebar-foreground">Narayan Dairy</p>
            <p className="text-xs leading-tight opacity-60 text-sidebar-foreground">
              Crate Management
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 pt-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                pathname === to
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-sidebar-border px-4 py-4">
          <p className="truncate text-xs text-sidebar-foreground/60">{email ?? "Signed in"}</p>
          <button
            onClick={signOut}
            className="mt-2 flex items-center gap-2 text-sm text-sidebar-foreground/80 hover:text-sidebar-accent-foreground"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-card px-5 py-5 lg:px-8">
          <div className="flex items-start gap-3">
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
              <h1 className="text-xl font-semibold">{title}</h1>
              {description && (
                <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
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
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <Icon className="size-8 text-muted-foreground" />
      <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
