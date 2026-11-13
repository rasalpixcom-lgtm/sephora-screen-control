// Avoid leaving a form or monitoring poll stuck indefinitely during an outage.
export async function clientFetch(input: RequestInfo | URL, options?: RequestInit) {
  const callerSignal = options?.signal === undefined && input instanceof Request ? input.signal : options?.signal;
  const timeoutSignal = AbortSignal.timeout(15000);
  const signal = callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;
  const headers = workspaceRequestHeaders(input, options?.headers);
  try { return await fetch(input, { ...options, headers, signal }); }
  catch (error) {
    if (signal.aborted && signal.reason === timeoutSignal.reason && timeoutSignal.aborted) throw new Error("The server took too long to respond. Please try again.");
    throw error;
  }
}

export function workspaceRequestHeaders(input: RequestInfo | URL, given?: HeadersInit) {
  const headers = new Headers(given ?? (input instanceof Request ? input.headers : undefined));
  if (typeof document !== "undefined") {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    const workspace = document.querySelector<HTMLElement>("[data-client-workspace]")?.dataset.clientWorkspace;
    if (workspace && url.origin === window.location.origin && url.pathname.startsWith("/api/")) headers.set("x-client-id", workspace);
  }
  return headers;
}
