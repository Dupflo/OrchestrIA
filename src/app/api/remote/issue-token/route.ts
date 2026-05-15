import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { signToken, hashToken } from "@/lib/remote/token";
import { requireLocalhost } from "@/lib/remote/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_SECONDS = 24 * 60 * 60;

export async function POST(req: Request) {
  const localGate = requireLocalhost(req);
  if (localGate) return localGate;

  const body = (await req.json()) as { client_name?: string };
  if (!body.client_name || typeof body.client_name !== "string") {
    return NextResponse.json({ error: "client_name required" }, { status: 400 });
  }

  const { token, payload } = signToken(body.client_name, TTL_SECONDS);

  getDb()
    .prepare(
      `INSERT INTO remote_tokens (jti, client_name, token_hash, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(payload.jti, payload.sub, hashToken(token), payload.iat, payload.exp);

  return NextResponse.json(
    {
      token,
      jti: payload.jti,
      client_name: payload.sub,
      issued_at: payload.iat,
      expires_at: payload.exp,
    },
    { status: 201 },
  );
}
