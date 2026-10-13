import { onSignToken } from "./onsign-stream";

export const CHECK_INTERVAL_MS = 60000;
export const RESULT_MAX_AGE_MS = 180000;
export const CHECK_CONCURRENCY = 3;
export type PreviewHealthStatus = "available" | "unavailable" | "checking" | "unknown" | "no_link" | "unsupported";
export type PreviewHealth = { screenId: string; status: PreviewHealthStatus; lastImageAt: string | null; checkedAt: string | null };
type Screen = { id: string; liveUrl: string | null };
type Result = { received: boolean; at: number };
type Probe = (token: string) => { result: Promise<Result>; cancel: () => void };
type Entry = { token: string | null; status: PreviewHealthStatus; lastImageAt: number | null; checkedAt: number | null; due: number };
export type PreviewObservation = { screenId:string; token:string; received:boolean; checkedAt:number };

// One queue per server, independent of wall selection and connected browsers.
export class PreviewHealthChecker {
  private entries = new Map<string, Entry>();
  private active = new Map<string, { entry: Entry; cancel: () => void }>();
  constructor(private probe: Probe, private now: () => number = Date.now, private onResult?: (result:PreviewObservation) => void) {}

  sync(screens: Screen[]) {
    const ids = new Set(screens.map(screen => screen.id));
    for (const [id, entry] of this.entries) {
      if (!ids.has(id)) { this.entries.delete(id); this.active.get(id)?.cancel(); this.active.delete(id); }
      else if (entry.checkedAt !== null && entry.checkedAt > this.now()) entry.due = this.now();
    }
    for (const screen of screens) {
      const token = screen.liveUrl ? onSignToken(screen.liveUrl) : null;
      const initial: PreviewHealthStatus = !screen.liveUrl ? "no_link" : !token ? "unsupported" : "unknown";
      const old = this.entries.get(screen.id);
      if (old && old.token === token && (token || old.status === initial)) continue;
      this.active.get(screen.id)?.cancel(); this.active.delete(screen.id);
      this.entries.set(screen.id, { token, status: initial, checkedAt: null, lastImageAt: null, due: 0 });
    }
  }

  pump() {
    const due = [...this.entries].filter(([id, entry]) => entry.token && entry.due <= this.now() && !this.active.has(id)).sort((a, b) => a[1].due - b[1].due);
    for (const [id, entry] of due) {
      if (this.active.size >= CHECK_CONCURRENCY) break;
      const task = this.probe(entry.token!);
      this.active.set(id, { entry, cancel: task.cancel });
      if (entry.checkedAt === null) entry.status = "checking";
      const finish = (result: Result) => {
        if (this.entries.get(id) !== entry || this.active.get(id)?.entry !== entry) return;
        this.active.delete(id);
        entry.status = result.received ? "available" : "unavailable";
        entry.checkedAt = result.at;
        if (result.received) entry.lastImageAt = result.at;
        entry.due = this.now() + CHECK_INTERVAL_MS;
        this.onResult?.({ screenId:id, token:entry.token!, received:result.received, checkedAt:result.at });
      };
      void task.result.then(finish, () => finish({ received: false, at: this.now() }));
    }
  }

  snapshot(): PreviewHealth[] {
    return [...this.entries].map(([screenId, entry]) => ({
      screenId,
      status: entry.checkedAt !== null && this.now() - entry.checkedAt > RESULT_MAX_AGE_MS ? "unknown" : entry.status,
      lastImageAt: entry.lastImageAt === null ? null : new Date(entry.lastImageAt).toISOString(),
      checkedAt: entry.checkedAt === null ? null : new Date(entry.checkedAt).toISOString(),
    }));
  }

  stop() { this.entries.clear(); for (const task of this.active.values()) task.cancel(); this.active.clear(); }
}
