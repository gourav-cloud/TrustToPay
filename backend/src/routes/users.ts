import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { AppError, asyncHandler } from "../lib/errors.js";
import { requireAuth } from "../auth/middleware.js";
import { toPublicUser } from "../auth/service.js";
import { audit } from "../lib/audit.js";

const router = Router();
router.use(requireAuth);

const payoutProfileSchema = z.object({
  payoutEmail: z.string().trim().max(200).email("Enter a valid PayPal email.").nullable().optional(),
  payoutConsent: z.boolean().optional(),
  headline: z.string().trim().max(160).nullable().optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
  timezone: z.string().trim().max(80).optional(),
  skills: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
});

router.patch(
  "/me/payout",
  asyncHandler(async (req, res) => {
    const body = payoutProfileSchema.parse(req.body);
    const current = await prisma.userProfile.findUnique({ where: { userId: req.user!.id } });
    const nextEmail = body.payoutEmail === undefined ? current?.payoutEmail ?? null : body.payoutEmail;
    const nextConsent = body.payoutConsent === undefined ? current?.payoutConsent ?? false : body.payoutConsent;

    if (nextConsent && !nextEmail) {
      throw new AppError(
        400,
        "PAYOUT_EMAIL_REQUIRED",
        "A PayPal payout email is required before consent can be recorded.",
      );
    }
    if (req.user!.role === "REQUESTER" && (body.payoutConsent || body.payoutEmail)) {
      throw new AppError(
        409,
        "NOT_A_REVIEWER",
        "Payout details are only available to reviewer accounts. Reviewers receive rewards; requesters fund them.",
      );
    }

    const profile = await prisma.userProfile.upsert({
      where: { userId: req.user!.id },
      update: {
        ...(body.payoutEmail !== undefined ? { payoutEmail: body.payoutEmail } : {}),
        ...(body.payoutConsent !== undefined ? { payoutConsent: body.payoutConsent } : {}),
        ...(body.headline !== undefined ? { headline: body.headline } : {}),
        ...(body.bio !== undefined ? { bio: body.bio } : {}),
        ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
      },
      create: {
        userId: req.user!.id,
        payoutEmail: body.payoutEmail ?? null,
        payoutConsent: body.payoutConsent ?? false,
        headline: body.headline ?? null,
        bio: body.bio ?? null,
        timezone: body.timezone ?? "UTC",
      },
    });

    if (body.skills) {
      await prisma.$transaction(async (db) => {
        await db.reviewerSkill.deleteMany({ where: { userId: req.user!.id } });
        if (body.skills!.length > 0) {
          await db.reviewerSkill.createMany({
            data: body.skills!.map((name) => ({ userId: req.user!.id, name })),
          });
        }
      });
    }

    await audit(prisma, req, {
      action: "PAYOUT_PROFILE_UPDATED",
      entityType: "UserProfile",
      entityId: profile.id,
      metadata: {
        payoutEmailSet: Boolean(profile.payoutEmail),
        payoutConsent: profile.payoutConsent,
        skills: body.skills?.length,
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { profile: true, skills: true },
    });
    res.json({ user: user ? toPublicUser(user) : null, payoutProfile: profile });
  }),
);

export default router;
