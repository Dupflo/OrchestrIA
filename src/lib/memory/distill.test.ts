import { describe, it, expect, afterEach } from "vitest";
import { distillationEnabled, buildDistillPrompt } from "./distill";

describe("distillationEnabled", () => {
  const prev = process.env.ORCHESTRIA_MEMORY_DISTILL;
  afterEach(() => {
    if (prev === undefined) delete process.env.ORCHESTRIA_MEMORY_DISTILL;
    else process.env.ORCHESTRIA_MEMORY_DISTILL = prev;
  });

  it("defaults to OFF (opt-in)", () => {
    delete process.env.ORCHESTRIA_MEMORY_DISTILL;
    expect(distillationEnabled()).toBe(false);
    process.env.ORCHESTRIA_MEMORY_DISTILL = "0";
    expect(distillationEnabled()).toBe(false);
    process.env.ORCHESTRIA_MEMORY_DISTILL = "true";
    expect(distillationEnabled()).toBe(false);
  });

  it("is enabled only by the explicit '1' opt-in", () => {
    process.env.ORCHESTRIA_MEMORY_DISTILL = "1";
    expect(distillationEnabled()).toBe(true);
  });
});

describe("buildDistillPrompt", () => {
  it("embeds both the existing learnings and the raw archive under clear markers", () => {
    const p = buildDistillPrompt("- user prefers French", "## 2026-05-17\n**user:** hi");
    expect(p).toContain("=== (A) CURRENT learnings.md ===");
    expect(p).toContain("- user prefers French");
    expect(p).toContain("=== (B) RAW log being archived ===");
    expect(p).toContain("**user:** hi");
    expect(p).toContain("Output ONLY the final Markdown");
  });

  it("uses an (empty) placeholder when there are no prior learnings", () => {
    const p = buildDistillPrompt("   ", "raw stuff");
    expect(p).toContain("=== (A) CURRENT learnings.md ===\n(empty)");
  });
});
