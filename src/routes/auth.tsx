import { useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
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

function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await router.invalidate();
      await navigate({ to: "/dashboard" });
    } catch {
      toast.error("Invalid email or password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-12"
      style={{
        background:
          "linear-gradient(135deg, oklch(0.95 0.025 240) 0%, oklch(0.98 0.010 240) 50%, oklch(0.96 0.020 255) 100%)",
      }}
    >
      <div className="w-full max-w-md">
        {/* Card */}
        <div
          className="rounded-2xl bg-white px-8 py-10 shadow-xl"
          style={{
            border: "1.5px solid oklch(0.80 0.04 240)",
            boxShadow:
              "0 4px 6px -1px oklch(0.30 0.10 255 / 0.08), 0 20px 60px -8px oklch(0.30 0.10 255 / 0.15)",
          }}
        >
          {/* Logo area */}
          <div className="mb-6 flex flex-col items-center">
            <div
              className="mb-4 flex h-28 w-28 items-center justify-center rounded-full bg-white"
              style={{
                border: "2px solid oklch(0.80 0.06 240)",
                boxShadow: "0 2px 12px oklch(0.40 0.12 255 / 0.15)",
              }}
            >
              <img
                src="/narayan-dairy-logo.svg"
                alt="Narayan Dairy Logo"
                className="h-24 w-24 object-contain"
                style={{ borderRadius: "50%" }}
              />
            </div>
            <h1
              className="text-xl font-bold tracking-tight"
              style={{ color: "oklch(0.22 0.09 255)", fontFamily: "Space Grotesk, sans-serif" }}
            >
              Narayan Dairy
            </h1>
            <p
              className="mt-0.5 text-sm font-semibold tracking-wide"
              style={{ color: "oklch(0.45 0.12 255)" }}
            >
              Crate Management
            </p>
            <p className="mt-1 text-xs text-gray-400 tracking-widest uppercase">
              Secure Inventory System
            </p>
          </div>

          {/* Divider */}
          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1" style={{ background: "oklch(0.88 0.018 240)" }} />
            <span className="text-xs font-medium" style={{ color: "oklch(0.60 0.05 245)" }}>
              Welcome back
            </span>
            <span className="h-px flex-1" style={{ background: "oklch(0.88 0.018 240)" }} />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="email"
                className="text-sm font-medium"
                style={{ color: "oklch(0.30 0.08 252)" }}
              >
                Email
              </Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@narayandairy.com"
                autoComplete="email"
                className="h-11 rounded-lg border transition-shadow focus:shadow-sm"
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
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="h-11 rounded-lg border transition-shadow focus:shadow-sm"
                style={{ borderColor: "oklch(0.82 0.04 240)" }}
              />
            </div>

            <Button
              id="login-submit"
              type="submit"
              className="mt-2 h-11 w-full rounded-lg text-sm font-semibold tracking-wide transition-all"
              disabled={busy}
              style={{
                background: "oklch(0.28 0.10 255)",
                color: "white",
              }}
            >
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              {busy ? "Signing in…" : "LOGIN"}
            </Button>
          </form>

          {/* Footer */}
          <p className="mt-6 text-center text-xs" style={{ color: "oklch(0.65 0.03 240)" }}>
            Access is restricted to authorized personnel only.
            <br />
            Contact your administrator for access.
          </p>
        </div>

        {/* Bottom branding */}
        <p className="mt-5 text-center text-xs" style={{ color: "oklch(0.60 0.05 245)" }}>
          © {new Date().getFullYear()} Narayan Dairy · Crate Management System
        </p>
      </div>
    </div>
  );
}
