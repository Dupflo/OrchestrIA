import { NextResponse } from "next/server";
import { readJson } from "@/lib/api/json";
import { listSkills, createSkill, type SkillInput } from "@/lib/skillsRepo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listSkills());
}

export async function POST(req: Request) {
  const body = await readJson<Partial<SkillInput>>(req);
  if (!body) return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  if (!body.id || typeof body.id !== "string") {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  try {
    const skill = createSkill(body as SkillInput);
    return NextResponse.json(skill, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const status = msg.includes("already exists") ? 409 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
