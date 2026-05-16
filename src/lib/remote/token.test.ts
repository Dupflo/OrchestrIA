import { describe, it, expect, vi } from "vitest";
import crypto from "crypto";

// Hermetic: never touch the real .orchestria/remote.key file.
// vi.hoisted so TEST_KEY is initialized before the hoisted vi.mock factory runs.
const { TEST_KEY } = vi.hoisted(() => ({
  TEST_KEY: Buffer.from("0123456789abcdef0123456789abcdef0123456789abcdef"),
}));
vi.mock("./key", () => ({ getRemoteKey: () => TEST_KEY }));

import { signToken, verifyToken, hashToken } from "./token";

function hmac(input: string): string {
  return crypto.createHmac("sha256", TEST_KEY).update(input).digest("base64url");
}

describe("signToken / verifyToken (P0-adjacent: remote auth core)", () => {
  it("round-trips a valid token", () => {
    const { token, payload } = signToken("client-a", 3600);
    const verified = verifyToken(token);
    expect(verified).not.toBeNull();
    expect(verified!.sub).toBe("client-a");
    expect(verified!.jti).toBe(payload.jti);
  });

  it("rejects a tampered signature", () => {
    const { token } = signToken("client-a", 3600);
    const [h, b] = token.split(".");
    expect(verifyToken(`${h}.${b}.deadbeef`)).toBeNull();
  });

  it("rejects a tampered payload (signature no longer matches)", () => {
    const { token } = signToken("client-a", 3600);
    const [h, , sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ jti: "x", sub: "admin", iat: 0, exp: 9999999999 }))
      .toString("base64url");
    expect(verifyToken(`${h}.${forged}.${sig}`)).toBeNull();
  });

  it("rejects a token without exactly three parts", () => {
    expect(verifyToken("a.b")).toBeNull();
    expect(verifyToken("a.b.c.d")).toBeNull();
    expect(verifyToken("")).toBeNull();
  });

  it("rejects an expired token", () => {
    const { token } = signToken("client-a", -10);
    expect(verifyToken(token)).toBeNull();
  });

  it("rejects a correctly-signed but non-JSON body", () => {
    const h = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const body = Buffer.from("not-json").toString("base64url");
    const sig = hmac(`${h}.${body}`);
    expect(verifyToken(`${h}.${body}.${sig}`)).toBeNull();
  });

  it("hashToken is deterministic", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });
});
