// Avoid leaving a form or monitoring poll stuck indefinitely during an outage.
export async function clientFetch(input: RequestInfo | URL, options?: RequestInit) {
  try { return await fetch(input, { ...options, signal: AbortSignal.timeout(15000) }); }
  catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new Error("The server took too long to respond. Please try again.");
    throw error;
  }
}
