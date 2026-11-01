import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Response } from "express";
import type { User } from "@prisma/client";
import { config } from "../config.js";

const BCRYPT_ROUNDS = 12;
const AGENT_KEY_PREFIX_PATTERN = /^ttp_(?:live|test)_[A-Za-z0-9_-]{16,128}$/;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function hashAgentApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

export function isAgentApiKeyFormat(rawKey: string): boolean {
  return AGENT_KEY_PREFIX_PATTERN.test(rawKey);
}

export function generateAgentApiKey(mode: "live" | "test" = "test"): {
  rawKey: string;
  keyHash: string;
  prefix: string;
} {
  const randomPart = crypto.randomBytes(24).toString("hex");
  const rawKey = `ttp_${mode}_${randomPart}`;
  const keyHash = hashAgentApiKey(rawKey);
  const prefix = rawKey.slice(0, 16);
  return { rawKey, keyHash, prefix };
}

export type SessionPayload = {
  sub: string;
  role: string;
};

export function signSessionToken(user: Pick<User, "id" | "role">): string {
  return jwt.sign({ sub: user.id, role: user.role } satisfies SessionPayload, config.sessionSecret, {
    expiresIn: `${config.sessionTtlDays}d`,
    issuer: "trusttopay",
    audience: "trusttopay-web",
  });
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const payload = jwt.verify(token, config.sessionSecret, {
      issuer: "trusttopay",
      audience: "trusttopay-web",
    });
    if (typeof payload === "string" || !payload.sub) return null;
    return { sub: String(payload.sub), role: String(payload.role ?? "") };
  } catch {
    return null;
  }
}

function isHttpsRequest(res: Response): boolean {
  const req = res.req;
  const forwardedProto = req?.headers?.["x-forwarded-proto"];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const origin = req?.headers?.origin ?? "";
  const referer = req?.headers?.referer ?? "";
  const host = req?.headers?.host ?? "";
  const forwardedHost = req?.headers?.["x-forwarded-host"];
  const fHost = Array.isArray(forwardedHost) ? forwardedHost[0] : (forwardedHost ?? "");
  return Boolean(
    config.isProduction ||
      req?.secure ||
      (typeof proto === "string" && proto.toLowerCase().includes("https")) ||
      origin.startsWith("https://") ||
      referer.startsWith("https://") ||
      host.endsWith(".run.app") ||
      fHost.endsWith(".run.app"),
  );
}

export function setSessionCookie(res: Response, token: string): void {
  const secure = isHttpsRequest(res);
  res.cookie(config.sessionCookieName, token, {
    httpOnly: true,
    sameSite: secure ? "none" : "lax",
    secure,
    ...(secure ? { partitioned: true } : {}),
    path: "/",
    maxAge: config.sessionTtlDays * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  const secure = isHttpsRequest(res);
  res.clearCookie(config.sessionCookieName, {
    httpOnly: true,
    sameSite: secure ? "none" : "lax",
    secure,
    ...(secure ? { partitioned: true } : {}),
    path: "/",
  });
}

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  isReviewerApproved: boolean;
  isActive: boolean;
  createdAt: Date;
  profile?: {
    headline: string | null;
    bio: string | null;
    timezone: string;
    payoutProvider: string;
    payoutEmail: string | null;
    payoutConsent: boolean;
  } | null;
  skills?: { id: string; name: string; category: string; level: number }[];
};

export function toPublicUser(user: User & { profile?: PublicUser["profile"]; skills?: PublicUser["skills"] }): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isReviewerApproved: user.isReviewerApproved,
    isActive: user.isActive,
    createdAt: user.createdAt,
    profile: user.profile
      ? {
          headline: user.profile.headline,
          bio: user.profile.bio,
          timezone: user.profile.timezone,
          payoutProvider: user.profile.payoutProvider,
          payoutEmail: user.profile.payoutEmail,
          payoutConsent: user.profile.payoutConsent,
        }
      : null,
    skills: user.skills?.map((skill) => ({
      id: skill.id,
      name: skill.name,
      category: skill.category,
      level: skill.level,
    })),
  };
}
