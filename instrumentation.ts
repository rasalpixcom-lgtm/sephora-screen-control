export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { startClientWorkers } = await import("./lib/client-workers");
    startClientWorkers();
    if (process.env.COMPLAINT_ALERTS_ENABLED === "true") {
      const { startComplaintAlertWorker } = await import("./lib/complaint-alerts-worker");
      startComplaintAlertWorker();
    }
  }
}
