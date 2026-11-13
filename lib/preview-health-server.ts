import { activeClientId, activeWorkspace, runWithWorkspace } from "./client-workspace";
import { database } from "./database";
import { PreviewHealthChecker } from "./preview-health";
import { probePreview } from "./preview-probe";
import { reconcilePreviewInventory, recordPreviewResult } from "./preview-incidents";

type Service = { checker: PreviewHealthChecker; inventoryAt: number | null; inventoryError: boolean; persistenceError: boolean; timer?: ReturnType<typeof setTimeout> };
const shared = globalThis as typeof globalThis & { pixcomPreviewHealth?: Map<string,Service> };

function startPreviewHealthChecksInScope() {
  const services=shared.pixcomPreviewHealth??=new Map();
  const existing=services.get(activeClientId());
  if (existing) return existing;
  const checker = new PreviewHealthChecker(probePreview, Date.now, result => {
    void recordPreviewResult(result).then(() => { const current=services.get(activeClientId()); if (current) current.persistenceError = false; }, () => {
      const current=services.get(activeClientId()); if (current) current.persistenceError = true;
      console.error("Preview incident persistence failed");
    });
  });
  const service: Service = { checker, inventoryAt: null, inventoryError: false, persistenceError: false };
  services.set(activeClientId(),service);
  const tick = async () => {
    try {
      const active = await database().prepare("SELECT pixcom_workspace() AS id").first<{ id: string | null }>();
      if (active?.id !== activeClientId()) { service.checker.stop(); service.inventoryAt = null; return; }
      if (service.inventoryAt === null || Date.now() - service.inventoryAt >= 15000) {
        const screens = await database().prepare('SELECT id, live_url AS "liveUrl" FROM entities WHERE type = \'screen\' ORDER BY created_at, id').all<{ id: string; liveUrl: string | null }>();
        service.checker.sync(screens.results);
        await reconcilePreviewInventory();
        service.inventoryAt = Date.now(); service.inventoryError = false;
      }
      service.checker.pump();
    } catch { service.inventoryError = true; }
    finally { service.timer = setTimeout(tick, service.inventoryError ? 15000 : 1000); service.timer.unref(); }
  };
  void tick();
  return service;
}

export function previewHealthSnapshot() {
  const service = startPreviewHealthChecks();
  return { checks: service.checker.snapshot(), inventoryAt: service.inventoryAt === null ? null : new Date(service.inventoryAt).toISOString(), inventoryError: service.inventoryError, persistenceError: service.persistenceError, checkedAt: new Date().toISOString() };
}

export function startPreviewHealthChecks() { return runWithWorkspace(activeWorkspace(), startPreviewHealthChecksInScope); }
