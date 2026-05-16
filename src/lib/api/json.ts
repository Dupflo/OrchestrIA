/**
 * JSON boundary helpers.
 *
 * `readJson` — parse a request body defensively. Returns `null` (never throws)
 * on invalid JSON or a non-object body, so route handlers can emit a clean
 * 400 instead of leaking an unhandled 500. It does NOT validate shape: this is
 * a local-first, single-user app whose API is driven by its own first-party
 * UI; downstream truthy-checks remain the per-route contract. The genuinely
 * untrusted boundaries (channel inbound webhooks, remote/*) carry their own
 * signature/token gates.
 *
 * `safeJson` — parse a string we previously wrote (e.g. an `events.body`
 * column). One corrupt row must not 500 the whole endpoint, so a parse
 * failure yields the caller's fallback instead of throwing.
 */

export async function readJson<T>(req: Request): Promise<T | null> {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object") return null;
  return parsed as T;
}

export function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
