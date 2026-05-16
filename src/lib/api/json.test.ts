import { describe, it, expect } from "vitest";
import { readJson, safeJson } from "./json";

function req(body: string): Request {
  return new Request("http://x/api", { method: "POST", body });
}

describe("readJson", () => {
  it("returns the parsed object for a valid JSON body", async () => {
    expect(await readJson<{ a: number }>(req('{"a":1}'))).toEqual({ a: 1 });
  });

  it("returns null for invalid JSON instead of throwing", async () => {
    expect(await readJson(req("{not json"))).toBeNull();
    expect(await readJson(req(""))).toBeNull();
  });

  it("returns null for non-object JSON (string / number / null / array-is-object)", async () => {
    expect(await readJson(req('"hello"'))).toBeNull();
    expect(await readJson(req("42"))).toBeNull();
    expect(await readJson(req("null"))).toBeNull();
    // arrays are objects in JS — allowed through (callers expect objects in practice)
    expect(await readJson(req("[1,2]"))).toEqual([1, 2]);
  });
});

describe("safeJson", () => {
  it("parses valid JSON", () => {
    expect(safeJson('{"result":"ok"}', {})).toEqual({ result: "ok" });
  });

  it("returns the fallback for a corrupt/empty/nullish row body", () => {
    expect(safeJson("{broken", { result: "" })).toEqual({ result: "" });
    expect(safeJson(null, null)).toBeNull();
    expect(safeJson(undefined, { x: 1 })).toEqual({ x: 1 });
    expect(safeJson("", "fb")).toBe("fb");
  });
});
