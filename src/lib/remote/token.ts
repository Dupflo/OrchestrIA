import crypto from "crypto";
import { getRemoteKey } from "./key";

export interface TokenPayload {
  jti: string;
  sub: string;
  iat: number;
  exp: number;
}

const HEADER = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");

function hmac(input: string): string {
  return crypto.createHmac("sha256", getRemoteKey()).update(input).digest("base64url");
}

export function signToken(sub: string, ttlSeconds: number): { token: string; payload: TokenPayload } {
  const jti = crypto.randomBytes(16).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = { jti, sub, iat: now, exp: now + ttlSeconds };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signed = `${HEADER}.${body}`;
  return { token: `${signed}.${hmac(signed)}`, payload };
}

export function verifyToken(token: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, body, sig] = parts;
  const expected = hmac(`${h}.${body}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload.jti || !payload.sub || !payload.exp) return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
