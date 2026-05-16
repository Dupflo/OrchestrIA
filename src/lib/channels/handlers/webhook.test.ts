import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import { verifyWebhookSignature } from "./webhook";
import type { WebhookChannelConfig } from "../types";

const SECRET = "super-secret-value";
const config: WebhookChannelConfig = {
  type: "webhook",
  default_agent: "_main",
  secret_env: "TEST_WEBHOOK_SECRET",
};

function sign(body: string): string {
  return crypto.createHmac("sha256", SECRET).update(body).digest("hex");
}

describe("verifyWebhookSignature (P0-adjacent: webhook auth gate)", () => {
  beforeEach(() => {
    process.env.TEST_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.TEST_WEBHOOK_SECRET;
  });

  it("accepts a valid bare-hex signature", () => {
    const body = '{"hello":"world"}';
    expect(verifyWebhookSignature(body, config, sign(body))).toBe(true);
  });

  it("accepts a valid sha256=-prefixed signature", () => {
    const body = '{"hello":"world"}';
    expect(verifyWebhookSignature(body, config, `sha256=${sign(body)}`)).toBe(true);
  });

  it("rejects a wrong signature", () => {
    const body = '{"hello":"world"}';
    expect(verifyWebhookSignature(body, config, sign("different-body"))).toBe(false);
  });

  it("rejects a null/empty header", () => {
    expect(verifyWebhookSignature("{}", config, null)).toBe(false);
    expect(verifyWebhookSignature("{}", config, "")).toBe(false);
  });

  it("rejects a length-mismatched signature", () => {
    expect(verifyWebhookSignature("{}", config, "abcd")).toBe(false);
  });

  it("throws when the secret env var is unset", () => {
    delete process.env.TEST_WEBHOOK_SECRET;
    expect(() => verifyWebhookSignature("{}", config, sign("{}"))).toThrow(
      /TEST_WEBHOOK_SECRET not set/,
    );
  });
});
