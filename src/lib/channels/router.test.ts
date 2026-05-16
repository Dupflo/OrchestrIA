import { describe, it, expect } from "vitest";
import { resolveRoute } from "./router";
import type { BaseChannelConfig } from "./types";

const config: BaseChannelConfig = {
  type: "webhook",
  default_agent: "_main",
  agent_routing: { "@research": "researcher", "@ops": "ops-bot" },
};

describe("resolveRoute (@agent routing)", () => {
  it("falls back to the default agent when there is no tag", () => {
    expect(resolveRoute("  just a message  ", config)).toEqual({
      agent: "_main",
      cleanedInput: "just a message",
    });
  });

  it("routes a known @tag and strips it from the input", () => {
    expect(resolveRoute("@research find the latest paper", config)).toEqual({
      agent: "researcher",
      cleanedInput: "find the latest paper",
    });
  });

  it("handles leading whitespace before the tag", () => {
    expect(resolveRoute("   @ops restart the worker", config)).toEqual({
      agent: "ops-bot",
      cleanedInput: "restart the worker",
    });
  });

  it("falls back to default (keeping the text) for an unknown @tag", () => {
    expect(resolveRoute("@unknown do a thing", config)).toEqual({
      agent: "_main",
      cleanedInput: "@unknown do a thing",
    });
  });

  it("does not treat a mid-string @ as a route tag", () => {
    expect(resolveRoute("email me at a@b.com", config)).toEqual({
      agent: "_main",
      cleanedInput: "email me at a@b.com",
    });
  });
});
