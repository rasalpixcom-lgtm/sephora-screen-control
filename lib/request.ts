export class RequestError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

// Bound streamed bodies too: Content-Length is not always present or trustworthy.
export async function readObject(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new RequestError("Send a JSON request.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("Invalid request body.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) { await reader.cancel(); throw new RequestError("Request is too large.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new RequestError("Invalid JSON request."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RequestError("Request must be a JSON object.");
  return value as Record<string, unknown>;
}

export function requestFailure(error: unknown) {
  if (error instanceof RequestError) return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  // Do not put SQL parameters, password hashes, or connection strings into logs.
  console.error("Server request failed", (error as { code?: string })?.code || "unavailable");
  return Response.json({ error: "The service is temporarily unavailable. Please try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
}
