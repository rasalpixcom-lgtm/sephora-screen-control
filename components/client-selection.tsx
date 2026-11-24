"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowLeftToLine, ArrowRight, Check, ChevronDown, GripVertical, RotateCcw, ShieldCheck } from "lucide-react";

import { clientFetch } from "@/lib/client-fetch";
import { clientCardIds, moveClientCard, sameClientCardOrder } from "@/lib/client-card-ordering";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import SignOut from "@/components/sign-out";
import { ThemeToggle } from "@/components/theme-toggle";
import ClientLogo from "./client-logo";
import "./client-selection.css";

type Client = { id: string; name: string; logoKey?: string | null; backgroundKey?: string | null; role: string };
type Drag = {
  id: string; name: string; pointerId: number; startX: number; startY: number;
  x: number; y: number; active: boolean; original: string[]; originalReset: boolean;
};

export default function ClientSelection({ clients, email, orderUserId, admin = false, initialOrder = [], orderVersion = null }: {
  admin?: boolean; clients: Client[]; email: string; orderUserId: string; initialOrder?: string[]; orderVersion?: string | null;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [saved, setSaved] = useState({ order: initialOrder, version: orderVersion });
  const [arranging, setArranging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(() => clientCardIds(clients, initialOrder));
  const [resetRequested, setResetRequested] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draftRef = useRef(draft);
  const gridRef = useRef<HTMLDivElement>(null);
  const arrangeRef = useRef<HTMLButtonElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const handleRefs = useRef(new Map<string, HTMLButtonElement>());
  const moveRefs = useRef(new Map<string, HTMLButtonElement>());
  const movedControl = useRef<{ id: string; kind: "handle" | "menu" } | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const frameRef = useRef<number | null>(null);
  const alphabetical = clientCardIds(clients);
  const savedIds = clientCardIds(clients, saved.order);
  const displayedIds = arranging ? draft : savedIds;
  const byId = new Map(clients.map(client => [client.id, client]));
  const dirty = !sameClientCardOrder(draft, savedIds) || (resetRequested && saved.order.length > 0);
  const editBusy = saving || draggingId !== null;

  useLayoutEffect(() => {
    const moved = movedControl.current;
    if (!moved) return;
    movedControl.current = null;
    const control = (moved.kind === "handle" ? handleRefs : moveRefs).current.get(moved.id);
    // Read the destination only after React commits the reordered cards.
    control?.focus({ preventScroll: true });
    control?.scrollIntoView({ behavior: "instant", block: "nearest", inline: "nearest" });
  }, [draft]);

  function updateDraft(next: string[]) {
    draftRef.current = next;
    setDraft(next);
  }

  async function choose(clientId: string) {
    if (arranging || saving || pending !== null) return;
    setPending(clientId); setError("");
    try {
      const response = await clientFetch("/api/workspaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, next: new URLSearchParams(window.location.search).get("next") }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "This client could not be opened.");
      window.location.replace(data.next);
    } catch (error) { setError(error instanceof Error ? error.message : "Please try again."); setPending(null); }
  }

  function arrange() {
    updateDraft(savedIds);
    setResetRequested(false); setError(""); setArranging(true);
    setAnnouncement("Arrange your clients. Drag a handle or use the Move menu.");
  }

  function cancel() {
    if (saving) return;
    updateDraft(savedIds);
    setResetRequested(false); setError(""); setArranging(false);
    setAnnouncement("Arrangement cancelled. Your saved order is unchanged.");
    requestAnimationFrame(() => arrangeRef.current?.focus());
  }

  function move(client: Client, destination: number, focus: "handle" | "menu" = "menu") {
    if (editBusy) return;
    const next = moveClientCard(draftRef.current, client.id, destination);
    if (sameClientCardOrder(next, draftRef.current)) return;
    movedControl.current = { id: client.id, kind: focus };
    updateDraft(next); setResetRequested(false); setError("");
    setAnnouncement(`${client.name} moved to position ${next.indexOf(client.id) + 1} of ${next.length}.`);
  }

  function reset() {
    updateDraft(alphabetical); setResetRequested(true); setError("");
    setAnnouncement("Alphabetical order selected. Save order to keep it.");
  }

  async function save() {
    if (saving || draggingId !== null || !dirty) return;
    setSaving(true); setError("");
    try {
      const response = await clientFetch("/api/client-card-order", {
        method: "POST", headers: { "Content-Type": "application/json", "x-client-order-user": orderUserId },
        body: JSON.stringify({ order: resetRequested ? [] : draftRef.current, expectedVersion: saved.version }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(response.status === 409
        ? "The clients or your saved order changed elsewhere. Reload this page before saving again."
        : data.error || "Your order could not be saved. Please try again.");
      if (!Array.isArray(data.order) || !data.order.every((id: unknown) => typeof id === "string") || typeof data.version !== "string") {
        throw new Error("Your order could not be confirmed. Reload this page before trying again.");
      }
      setSaved({ order: data.order, version: data.version });
      updateDraft(clientCardIds(clients, data.order));
      setResetRequested(false); setArranging(false);
      setAnnouncement("Your client order is saved.");
      requestAnimationFrame(() => arrangeRef.current?.focus());
    } catch (error) { setError(error instanceof Error ? error.message : "Your order could not be saved. Please try again."); }
    finally { setSaving(false); }
  }

  const stopDrag = useCallback((cancelled: boolean) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    if (gridRef.current?.hasPointerCapture(drag.pointerId)) gridRef.current.releasePointerCapture(drag.pointerId);
    if (cancelled) {
      draftRef.current = drag.original;
      setDraft(drag.original); setResetRequested(drag.originalReset);
    }
    if (drag.active) setAnnouncement(cancelled
      ? `Move cancelled for ${drag.name}.`
      : `${drag.name} moved to position ${draftRef.current.indexOf(drag.id) + 1} of ${draftRef.current.length}.`);
    setDraggingId(null);
    requestAnimationFrame(() => handleRefs.current.get(drag.id)?.focus({ preventScroll: true }));
  }, []);

  const placeDraggedCard = useCallback((drag: Drag) => {
    const target = document.elementFromPoint(drag.x, drag.y)?.closest<HTMLElement>("[data-order-client]");
    if (target && gridRef.current?.contains(target)) {
      const next = moveClientCard(draftRef.current, drag.id, draftRef.current.indexOf(target.dataset.orderClient || ""));
      if (!sameClientCardOrder(next, draftRef.current)) {
        draftRef.current = next;
        setDraft(next); setResetRequested(false); setError("");
      }
    }
  }, []);

  const tickDrag = useCallback(function tick() {
    const drag = dragRef.current;
    if (!drag?.active) return;
    if (ghostRef.current) {
      const ghost = ghostRef.current;
      const left = Math.max(8, Math.min(window.innerWidth - ghost.offsetWidth - 8, drag.x + 14));
      const top = Math.max(8, Math.min(window.innerHeight - ghost.offsetHeight - 8, drag.y + 14));
      ghost.style.transform = `translate(${left}px,${top}px)`;
      ghost.style.visibility = "visible";
    }
    const edge = 72;
    if (drag.y >= 0 && drag.y <= window.innerHeight) {
      const distance = drag.y < edge ? drag.y - edge : drag.y > window.innerHeight - edge ? drag.y - (window.innerHeight - edge) : 0;
      if (distance) window.scrollBy(0, Math.max(-18, Math.min(18, distance / 4)));
    }
    placeDraggedCard(drag);
    frameRef.current = requestAnimationFrame(tick);
  }, [placeDraggedCard]);

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, client: Client) {
    if (saving || dragRef.current || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    dragRef.current = { id: client.id, name: client.name, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      x: event.clientX, y: event.clientY, active: false, original: [...draftRef.current], originalReset: resetRequested };
    gridRef.current?.setPointerCapture(event.pointerId);
  }

  function dragPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.x = event.clientX; drag.y = event.clientY;
    if (!drag.active && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) >= 8) {
      drag.active = true; setDraggingId(drag.id);
      setAnnouncement(`Moving ${drag.name}. Press Escape to cancel this move.`);
      frameRef.current = requestAnimationFrame(tickDrag);
    }
  }

  function releaseDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerId !== dragRef.current?.pointerId) return;
    // A quick release can precede the next animation frame. Commit its coordinates now.
    dragPointer(event);
    const drag = dragRef.current;
    if (drag?.active) placeDraggedCard(drag);
    stopDrag(false);
  }

  useEffect(() => {
    if (!arranging) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dragRef.current) { event.preventDefault(); stopDrag(true); }
    };
    const blur = () => stopDrag(true);
    window.addEventListener("keydown", escape);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", escape); window.removeEventListener("blur", blur); stopDrag(true); };
  }, [arranging, stopDrag]);

  function artwork(client: Client) {
    return <div className="client-selection-art" aria-hidden="true" style={client.backgroundKey ? { backgroundImage: `url("/api/client-background?client=${encodeURIComponent(client.id)}&v=${encodeURIComponent(client.backgroundKey)}")` } : undefined}>
      <ClientLogo clientId={client.id} version={client.logoKey} fallback={<span className="client-selection-name">{client.name}</span>}/>
    </div>;
  }

  return <main className="client-selection">
    <header>
      <span className="client-selection-brand">PIXCOM <small>SCREEN CONTROL</small></span>
      {(clients.length > 1 || saved.order.length > 0) && <div className="client-selection-order-actions">
          {arranging ? <>
            <button type="button" className="client-selection-order-reset" disabled={editBusy || (sameClientCardOrder(draft, alphabetical) && (resetRequested || saved.order.length === 0))} onClick={reset}><RotateCcw size={16} aria-hidden="true"/>Reset to A–Z</button>
            <button type="button" className="client-selection-order-button" disabled={editBusy} onClick={cancel}>Cancel</button>
            <button type="button" className="client-selection-order-button client-selection-order-save" disabled={editBusy || !dirty} onClick={() => void save()} aria-busy={saving}><Check size={16} aria-hidden="true"/>{saving ? "Saving…" : "Save order"}</button>
          </> : <button ref={arrangeRef} type="button" className="client-selection-order-button" disabled={pending !== null} onClick={arrange}><GripVertical size={18} aria-hidden="true"/>Arrange clients</button>}
      </div>}
      <div className="client-selection-session-actions"><ThemeToggle/><SignOut/></div>
    </header>
    <section>
      <div className="client-selection-heading">
        <div><h1>Choose client</h1><p>{email}</p></div>
      </div>
      {error && <p className="client-selection-error" role="alert">{error}</p>}
      <div className="client-selection-announcement" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
      <div className={`client-selection-grid${draggingId ? " client-selection-dragging" : ""}`} ref={gridRef}
        onPointerMove={dragPointer} onPointerUp={releaseDrag}
        onPointerCancel={event => { if (event.pointerId === dragRef.current?.pointerId) stopDrag(true); }}
        onLostPointerCapture={event => { if (event.pointerId === dragRef.current?.pointerId) stopDrag(true); }}>
        {admin && (arranging
          ? <div className="client-selection-card client-selection-administration client-selection-administration-fixed" aria-label="Administration, fixed position"><ShieldCheck size={36} aria-hidden="true"/><strong>Administration</strong></div>
          : <Link href="/admin/clients" className="client-selection-card client-selection-administration"><ShieldCheck size={36} aria-hidden="true"/><strong>Administration</strong></Link>)}
        {displayedIds.map((id, index) => {
          const client = byId.get(id);
          if (!client) return null;
          const cardClass = `client-selection-card client-selection-client${client.backgroundKey ? " client-selection-with-background" : ""}`;
          return arranging ? <div key={client.id} data-order-client={client.id} className={`${cardClass} client-selection-arranging${draggingId === client.id ? " client-selection-drag-source" : ""}`} role="group" aria-label={`${client.name}, position ${index + 1} of ${displayedIds.length}`}>
            {artwork(client)}
            <button type="button" className="client-selection-drag-handle" ref={element => { if (element) handleRefs.current.set(client.id, element); else handleRefs.current.delete(client.id); }}
              disabled={saving || (draggingId !== null && draggingId !== client.id)} aria-label={`Drag ${client.name} to rearrange`} title="Drag to rearrange, or use the Move menu"
              onPointerDown={event => startDrag(event, client)}
              onKeyDown={event => {
                const destination = event.key === "Home" ? 0 : event.key === "End" ? draft.length - 1
                  : ["ArrowLeft", "ArrowUp"].includes(event.key) ? index - 1 : ["ArrowRight", "ArrowDown"].includes(event.key) ? index + 1 : null;
                if (destination !== null) { event.preventDefault(); move(client, destination, "handle"); }
              }}><GripVertical size={20} aria-hidden="true"/></button>
            <span className="client-selection-position" aria-hidden="true">{index + 1}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><button ref={element => { if (element) moveRefs.current.set(client.id, element); else moveRefs.current.delete(client.id); }} type="button" className="client-selection-move-menu" disabled={editBusy} aria-label={`Move ${client.name}`}>Move<ChevronDown size={16} aria-hidden="true"/></button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="client-selection-move-options">
                <DropdownMenuItem disabled={index === 0} onSelect={() => move(client, 0)}><ArrowLeftToLine aria-hidden="true"/>Move to first</DropdownMenuItem>
                <DropdownMenuItem disabled={index === 0} onSelect={() => move(client, index - 1)}><ArrowLeft aria-hidden="true"/>Move earlier</DropdownMenuItem>
                <DropdownMenuItem disabled={index === draft.length - 1} onSelect={() => move(client, index + 1)}><ArrowRight aria-hidden="true"/>Move later</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div> : <button type="button" key={client.id} disabled={pending !== null} onClick={() => void choose(client.id)} className={cardClass}
            aria-label={pending === client.id ? `Opening ${client.name}` : `Open ${client.name}`} aria-busy={pending === client.id}>
            {artwork(client)}
            {pending === client.id && <span className="client-selection-opening" aria-hidden="true">Opening…</span>}
          </button>;
        })}
      </div>
      {draggingId && <div ref={ghostRef} className="client-selection-drag-ghost" aria-hidden="true"><GripVertical size={18}/>{byId.get(draggingId)?.name}</div>}
      {!clients.length && !admin && <><p>No clients are available. Contact your administrator.</p><Link href="/account">Manage your account</Link></>}
    </section>
  </main>;
}
