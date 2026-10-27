import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Response } from "express";
import type { User } from "@prisma/client";
import { config } from "../config.js";

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
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

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(config.sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    path: "/",
    maxAge: config.sessionTtlDays * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(config.sessionCookieName, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
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
