import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  // In production this would persist to SQLite via getDb()
  console.log("[event hook]", JSON.stringify(body));
  return NextResponse.json({ ok: true, received: Date.now() });
}
