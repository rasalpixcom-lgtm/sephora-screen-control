"use client";

import { useState } from "react";
import Link from "next/link";

import { ShieldCheck } from "lucide-react";

import { clientFetch } from "@/lib/client-fetch";

import SignOut from "@/components/sign-out";

import { ThemeToggle } from "@/components/theme-toggle";

import "./client-selection.css";
import ClientLogo from "./client-logo";

export default function ClientSelection({ clients, email, admin = false }: { admin?: boolean; clients: { id: string; name: string; logoKey?:string|null; backgroundKey?:string|null; role: string }[]; email: string }) {

  const [pending, setPending] = useState<string | null>(null);

  const [error, setError] = useState("");

  async function choose(clientId: string) {

    setPending(clientId); setError("");

    try {

      const response = await clientFetch("/api/workspaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, next: new URLSearchParams(window.location.search).get("next") }) });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "This client could not be opened.");

      window.location.replace(data.next);

    } catch (error) { setError(error instanceof Error ? error.message : "Please try again."); setPending(null); }

  }

  return <main className="client-selection">
    <header><span className="client-selection-brand">PIXCOM <small>SCREEN CONTROL</small></span><div><ThemeToggle/><SignOut/></div></header>
    <section>
      <h1>Choose client</h1><p>{email}</p>
      {error && <p className="client-selection-error" role="alert">{error}</p>}
      <div className="client-selection-grid">
        {admin && <Link href="/admin/clients" className="client-selection-card client-selection-administration"><ShieldCheck size={36} aria-hidden="true"/><strong>Administration</strong></Link>}
        {clients.map(client => <button
          type="button" key={client.id} disabled={pending !== null}
          onClick={() => void choose(client.id)}
          className={`client-selection-card client-selection-client${client.backgroundKey ? " client-selection-with-background" : ""}`}
          aria-label={pending === client.id ? `Opening ${client.name}` : `Open ${client.name}`}
          aria-busy={pending === client.id}
        >
          <div className="client-selection-art" aria-hidden="true" style={client.backgroundKey ? {backgroundImage:`url("/api/client-background?client=${encodeURIComponent(client.id)}&v=${encodeURIComponent(client.backgroundKey)}")`} : undefined}>
            <ClientLogo clientId={client.id} version={client.logoKey} fallback={<span className="client-selection-name">{client.name}</span>}/>
          </div>
          {pending === client.id && <span className="client-selection-opening" aria-hidden="true">Opening…</span>}
        </button>)}
      </div>
      {!clients.length && !admin && <p>No clients are available. Contact your administrator.</p>}
    </section>
  </main>;
}
