import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { AppError } from "../lib/errors.js";
import { asyncHandler } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { requireAuth } from "../auth/middleware.js";
import {
  clearSessionCookie,
  generateAgentApiKey,
  hashPassword,
  setSessionCookie,
  signSessionToken,
  toPublicUser,
  verifyPassword,
} from "../auth/service.js";
import { authRateLimit } from "../middleware/security.js";
import { paginated, paginationFrom } from "../lib/http.js";
import { serializeNotification } from "../serializers.js";

const router = Router();

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(200)
  .regex(/[A-Za-z]/, "Password must contain a letter.")
  .regex(/[0-9]/, "Password must contain a number.");

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().min(2).max(80),
  password: passwordSchema,
  role: z.enum(["REQUESTER", "REVIEWER"]),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

const demoLoginSchema = z.object({
  role: z.enum(["requester", "reviewer", "admin"]),
});

const createApiKeySchema = z.object({
  name: z.string().trim().min(2).max(80),
  mode: z.enum(["live", "test"]).default("test"),
});

const DEMO_EMAILS: Record<string, string> = {
  requester: "agent@demo.trusttopay.dev",
  reviewer: "reviewer@demo.trusttopay.dev",
  admin: "admin@demo.trusttopay.dev",
};

router.post(
  "/register",
  authRateLimit(),
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw new AppError(409, "EMAIL_TAKEN", "An account with that email already exists.");

    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        passwordHash,
        role: body.role,
        // In demo mode new reviewers are immediately approved for evaluation.
        // Outside demo mode an administrator must approve them first.
        isReviewerApproved: body.role === "REVIEWER" ? config.demoMode : false,
        profile: { create: {} },
      },
      include: { profile: true, skills: true },
    });

    const token = signSessionToken(user);
    setSessionCookie(res, token);
    await audit(prisma, req, {
      actorId: user.id,
      action: "USER_REGISTERED",
      entityType: "User",
      entityId: user.id,
      metadata: { role: user.role },
    });

    res.status(201).json({ user: toPublicUser(user) });
  }),
);

router.post(
  "/login",
  authRateLimit(),
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: body.email },
      include: { profile: true, skills: true },
    });

    const valid = user ? await verifyPassword(body.password, user.passwordHash) : false;
    if (!user || !valid || !user.isActive) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }

    const token = signSessionToken(user);
    setSessionCookie(res, token);
    await audit(prisma, req, {
      actorId: user.id,
      action: "USER_LOGIN",
      entityType: "User",
      entityId: user.id,
    });
    res.json({ user: toPublicUser(user) });
  }),
);

router.post(
  "/demo-login",
  authRateLimit(),
  asyncHandler(async (req, res) => {
    if (!config.demoMode || !config.demoUsersEnabled) {
      throw new AppError(404, "DEMO_LOGIN_DISABLED", "Demo login is disabled.");
    }
    const body = demoLoginSchema.parse(req.body);
    const email = DEMO_EMAILS[body.role];
    const user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true, skills: true },
    });
    if (!user) {
      throw new AppError(
        404,
        "DEMO_USER_MISSING",
        "Demo users are not seeded yet. Run `npm run setup` to initialize the database.",
      );
    }
    if (!user.isActive) throw new AppError(403, "USER_INACTIVE", "This demo user is deactivated.");

    const token = signSessionToken(user);
    setSessionCookie(res, token);
    await audit(prisma, req, {
      actorId: user.id,
      action: "DEMO_LOGIN",
      entityType: "User",
      entityId: user.id,
      metadata: { role: body.role },
    });
    res.json({ user: toPublicUser(user), demo: true });
  }),
);

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    if (req.user) {
      await audit(prisma, req, {
        actorId: req.user.id,
        action: "USER_LOGOUT",
        entityType: "User",
        entityId: req.user.id,
      });
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  }),
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { profile: true, skills: true },
    });
    const unread = await prisma.notification.count({
      where: { userId: req.user!.id, readAt: null },
    });
    res.json({ user: user ? toPublicUser(user) : null, unreadNotifications: unread });
  }),
);

router.get(
  "/api-keys",
  requireAuth,
  asyncHandler(async (req, res) => {
    const keys = await prisma.agentApiKey.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        createdAt: true,
        revokedAt: true,
      },
    });
    res.json({ items: keys });
  }),
);

router.post(
  "/api-keys",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user!.role !== "REQUESTER" && req.user!.role !== "ADMIN") {
      throw new AppError(403, "FORBIDDEN", "Only requesters and administrators can create agent API keys.");
    }
    const body = createApiKeySchema.parse(req.body);
    const { rawKey, keyHash, prefix } = generateAgentApiKey(body.mode);
    const created = await prisma.agentApiKey.create({
      data: {
        userId: req.user!.id,
        name: body.name,
        keyHash,
        prefix,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        createdAt: true,
        revokedAt: true,
      },
    });

    await audit(prisma, req, {
      actorId: req.user!.id,
      action: "AGENT_API_KEY_CREATED",
      entityType: "AgentApiKey",
      entityId: created.id,
      metadata: { name: created.name, prefix: created.prefix },
    });

    res.status(201).json({ apiKey: created, rawKey });
  }),
);

router.delete(
  "/api-keys/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const key = await prisma.agentApiKey.findUnique({ where: { id: req.params.id } });
    if (!key || (key.userId !== req.user!.id && req.user!.role !== "ADMIN")) {
      throw new AppError(404, "API_KEY_NOT_FOUND", "Agent API key not found.");
    }
    const updated = await prisma.agentApiKey.update({
      where: { id: key.id },
      data: { revokedAt: key.revokedAt ?? new Date() },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        createdAt: true,
        revokedAt: true,
      },
    });

    await audit(prisma, req, {
      actorId: req.user!.id,
      action: "AGENT_API_KEY_REVOKED",
      entityType: "AgentApiKey",
      entityId: updated.id,
      metadata: { prefix: updated.prefix },
    });

    res.json({ apiKey: updated });
  }),
);

router.get(
  "/notifications",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip } = paginationFrom(req.query);
    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.notification.count({ where: { userId: req.user!.id } }),
    ]);
    res.json(paginated(items.map(serializeNotification), total, page, pageSize));
  }),
);

router.post(
  "/notifications/:id/read",
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user!.id, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ ok: true });
  }),
);

router.post(
  "/notifications/read-all",
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ ok: true });
  }),
);

export default router;
