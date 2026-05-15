import { getDb } from "@/lib/db";
import { sseSubscribe } from "@/lib/orchestrator/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface EventRow {
  ts: number;
  kind: string;
  body: string;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (data: unknown) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const rows = getDb()
        .prepare("SELECT ts, kind, body FROM events WHERE mission_id = ? ORDER BY id ASC")
        .all(id) as EventRow[];
      for (const r of rows) {
        write({ type: r.kind, timestamp: r.ts * 1000, payload: JSON.parse(r.body) });
      }

      const unsubscribe = sseSubscribe(id, (ev) => write(ev));
      const ping = setInterval(() => controller.enqueue(enc.encode(": ping\n\n")), 15000);

      const cleanup = () => {
        clearInterval(ping);
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      };
      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
