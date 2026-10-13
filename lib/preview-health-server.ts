import { database } from "./database";
import { PreviewHealthChecker } from "./preview-health";
import { probePreview } from "./preview-probe";

type Service = { checker: PreviewHealthChecker; inventoryAt: number | null; inventoryError: boolean; timer?: ReturnType<typeof setTimeout> };
const shared = globalThis as typeof globalThis & { sephoraPreviewHealth?: Service };

export function startPreviewHealthChecks() {
  if (shared.sephoraPreviewHealth) return shared.sephoraPreviewHealth;
  const service: Service = { checker: new PreviewHealthChecker(probePreview), inventoryAt: null, inventoryError: false };
  shared.sephoraPreviewHealth = service;
  const tick = async () => {
    try {
      if (service.inventoryAt === null || Date.now() - service.inventoryAt >= 15000) {
        const screens = await database().prepare('SELECT id, live_url AS "liveUrl" FROM entities WHERE type = \'screen\' ORDER BY created_at, id').all<{ id: string; liveUrl: string | null }>();
        service.checker.sync(screens.results); service.inventoryAt = Date.now(); service.inventoryError = false;
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
  return { checks: service.checker.snapshot(), inventoryAt: service.inventoryAt === null ? null : new Date(service.inventoryAt).toISOString(), inventoryError: service.inventoryError, checkedAt: new Date().toISOString() };
}
