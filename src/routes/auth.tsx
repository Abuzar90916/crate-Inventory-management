import { useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Loader2, KeyRound, UserCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Narayan Dairy Crate Management" },
      { name: "description", content: "Sign in to manage crate inventory for Narayan Dairy." },
      { property: "og:title", content: "Sign in — Narayan Dairy Crate Management" },
      {
        property: "og:description",
        content: "Sign in to manage crate inventory for Narayan Dairy.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const DEMO_USERS = ["122AX019", "122AX020", "122AX021", "122AX022"] as const;

function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function pickDemoUser(u: string) {
    setUserId(u);
    setPassword("123456");
    setErrorMessage(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage(null);

    const cleanUserId = userId.trim().toUpperCase();
    if (!cleanUserId || !password) {
      setErrorMessage("Invalid User ID or Password");
      toast.error("Invalid User ID or Password");
      return;
    }

    // Verify it is one of the valid demo credentials
    if (!DEMO_USERS.includes(cleanUserId as (typeof DEMO_USERS)[number])) {
      setErrorMessage("Invalid User ID or Password");
      toast.error("Invalid User ID or Password");
      return;
    }

    setBusy(true);
    try {
      const email = `${cleanUserId.toLowerCase()}@narayandairy.internal`;
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      toast.success(`Welcome, ${cleanUserId}!`);
      await router.invalidate();
      await navigate({ to: "/dashboard" });
    } catch {
      setErrorMessage("Invalid User ID or Password");
      toast.error("Invalid User ID or Password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-12"
      style={{
        background:
          "linear-gradient(135deg, oklch(0.96 0.02 235) 0%, oklch(0.98 0.01 240) 50%, oklch(0.95 0.03 245) 100%)",
      }}
    >
      <div className="w-full max-w-md">
        {/* Card */}
        <div
          className="rounded-2xl bg-white px-8 py-10 shadow-xl"
          style={{
            border: "1.5px solid oklch(0.85 0.04 240)",
            boxShadow:
              "0 4px 6px -1px oklch(0.30 0.10 255 / 0.08), 0 20px 60px -8px oklch(0.30 0.10 255 / 0.12)",
          }}
        >
          {/* Logo area */}
          <div className="mb-6 flex flex-col items-center">
            <div
              className="mb-4 flex h-28 w-28 items-center justify-center rounded-full bg-white p-2"
              style={{
                border: "2px solid oklch(0.82 0.06 240)",
                boxShadow: "0 4px 16px oklch(0.35 0.12 255 / 0.15)",
              }}
            >
              <img
                src="/narayan-dairy-logo.svg"
                alt="Narayan Dairy Logo"
                className="h-full w-full object-contain"
                style={{ borderRadius: "50%" }}
              />
            </div>
            <h1
              className="text-2xl font-bold tracking-tight text-center"
              style={{ color: "oklch(0.22 0.09 255)", fontFamily: "Space Grotesk, sans-serif" }}
            >
              NARAYAN DAIRY
            </h1>
            <p
              className="mt-0.5 text-base font-semibold tracking-wide"
              style={{ color: "oklch(0.42 0.14 255)" }}
            >
              Crate Management
            </p>
            <p className="mt-1 text-xs text-muted-foreground tracking-widest uppercase">
              Shared Inventory System
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMessage && (
              <div
                className="rounded-lg border px-4 py-3 text-sm font-medium text-destructive bg-destructive/10 border-destructive/30"
                role="alert"
              >
                {errorMessage}
              </div>
            )}

            <div className="space-y-1.5">
              <Label
                htmlFor="user_id"
                className="text-sm font-medium"
                style={{ color: "oklch(0.30 0.08 252)" }}
              >
                User ID
              </Label>
              <Input
                id="user_id"
                type="text"
                required
                value={userId}
                onChange={(e) => {
                  setUserId(e.target.value.toUpperCase());
                  setErrorMessage(null);
                }}
                placeholder="e.g. 122AX019"
                autoComplete="username"
                className="h-11 rounded-lg border font-mono tracking-wider transition-shadow focus:shadow-sm uppercase"
                style={{ borderColor: "oklch(0.82 0.04 240)" }}
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                className="text-sm font-medium"
                style={{ color: "oklch(0.30 0.08 252)" }}
              >
                Password
              </Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="Enter password"
                autoComplete="current-password"
                className="h-11 rounded-lg border transition-shadow focus:shadow-sm"
                style={{ borderColor: "oklch(0.82 0.04 240)" }}
              />
            </div>

            <Button
              id="login-submit"
              type="submit"
              className="mt-3 h-11 w-full rounded-lg text-sm font-semibold tracking-wide transition-all"
              disabled={busy}
              style={{
                background: "oklch(0.28 0.10 255)",
                color: "white",
              }}
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Logging in…
                </>
              ) : (
                "LOGIN"
              )}
            </Button>
          </form>

          {/* Demo helper */}
          <div className="mt-6 rounded-xl border border-dashed border-border bg-muted/40 p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-2">
              <KeyRound className="size-3.5" />
              <span>Demo Login Accounts (Password: 123456)</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {DEMO_USERS.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => pickDemoUser(u)}
                  className="flex items-center justify-between rounded-md border border-border bg-white px-2.5 py-1.5 text-xs font-mono font-medium hover:border-primary hover:bg-primary/5 transition-colors text-foreground"
                >
                  <span>{u}</span>
                  <UserCheck className="size-3 text-primary opacity-70" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom branding */}
        <p className="mt-5 text-center text-xs" style={{ color: "oklch(0.60 0.05 245)" }}>
          © {new Date().getFullYear()} Narayan Dairy · Crate Management
        </p>
      </div>
    </div>
  );
}
