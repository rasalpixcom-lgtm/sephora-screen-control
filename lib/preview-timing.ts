// Use the server observation time, independent of the display device's clock.
export function unavailableMinutes(start: string | undefined, observedAt: string | undefined): number | null {
  if (!start || !observedAt) return null;
  const started = Date.parse(start), observed = Date.parse(observedAt);
  return Number.isFinite(started) && Number.isFinite(observed)
    ? Math.max(0, Math.floor((observed - started) / 60000))
    : null;
}
