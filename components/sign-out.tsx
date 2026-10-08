"use client";
import { clientFetch } from "@/lib/client-fetch";
import { useState } from "react";
import { LogOut } from "lucide-react";
export default function SignOut({ className = "outline-button", compact = false }: { className?: string; compact?: boolean }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  return <><button type="button" className={className} disabled={busy} aria-label="Sign out" title="Sign out" onClick={async () => { setBusy(true); setError(""); try { const response = await clientFetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); if (!response.ok) throw new Error(); window.location.replace("/login"); } catch { setError("Could not sign out. Try again."); setBusy(false); } }}><LogOut size={17}/>{!compact && (busy ? "Signing out…" : "Sign out")}</button>{error && <span role="alert">{error}</span>}</>;
}
