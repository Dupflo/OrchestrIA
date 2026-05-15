import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    version: "0.42.1",
    ts: Date.now(),
    mode: "local · airgapped",
  });
}
