import { NextResponse } from "next/server";
import { listMemoryFiles } from "@/lib/memoryRepo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params;
  return NextResponse.json(listMemoryFiles(agent));
}
