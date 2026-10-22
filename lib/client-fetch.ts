// Avoid leaving a form or monitoring poll stuck indefinitely during an outage.
export async function clientFetch(input: RequestInfo | URL, options?: RequestInit) {
  const callerSignal = options?.signal === undefined && input instanceof Request ? input.signal : options?.signal;
  const timeoutSignal = AbortSignal.timeout(15000);
  const signal = callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;
  try { return await fetch(input, { ...options, signal }); }
  catch (error) {
    if (signal.aborted && signal.reason === timeoutSignal.reason && timeoutSignal.aborted) throw new Error("The server took too long to respond. Please try again.");
    throw error;
  }
}
