import { describe, it, expect } from "vitest";
import { assertSafeAgentName } from "./config";

describe("assertSafeAgentName (P0: path traversal guard)", () => {
  it("accepts plain agent ids", () => {
    for (const ok of ["_main", "pinger", "research-bot", "Agent_1", "a"]) {
      expect(() => assertSafeAgentName(ok)).not.toThrow();
    }
  });

  it("rejects traversal and path separators", () => {
    for (const bad of [
      "..",
      ".",
      "../etc",
      "../../etc/passwd",
      "a/b",
      "a\\b",
      "/abs",
      "a.b",
      "with space",
      "tab\tname",
      "new\nline",
      "",
      "a$(whoami)",
    ]) {
      expect(() => assertSafeAgentName(bad)).toThrow(/invalid agent name/);
    }
  });

  it("rejects non-string input", () => {
    // @ts-expect-error — intentionally wrong type to prove the runtime guard
    expect(() => assertSafeAgentName(undefined)).toThrow(/invalid agent name/);
    // @ts-expect-error — intentionally wrong type
    expect(() => assertSafeAgentName({})).toThrow(/invalid agent name/);
  });
});
