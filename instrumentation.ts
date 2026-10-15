export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { startPreviewHealthChecks } = await import("./lib/preview-health-server");
    startPreviewHealthChecks();
    const { startEmailAlertWorker } = await import("./lib/email-alert-server");
    startEmailAlertWorker();
    const { startWhatsAppAlertWorker } = await import("./lib/whatsapp-alert-server");
    startWhatsAppAlertWorker();
  }
}
