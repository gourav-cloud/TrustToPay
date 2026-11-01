import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../auth/middleware.js";
import { asyncHandler, AppError } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import {
  listSkillsForUser,
  startAssessmentAttempt,
  submitAssessmentAttempt,
} from "../services/skills/assessmentEngine.js";
import { syncSpecialistToElasticIndex } from "../services/elastic/specialistIndexService.js";

const router = Router();

const startBodySchema = z.object({
  skillId: z.string().trim().min(1).max(80).optional(),
  level: z.coerce.number().int().min(1).max(3).optional(),
});

const submitBodySchema = z.object({
  attemptId: z.string().trim().min(1).max(80).optional(),
  answers: z.record(z.string(), z.string()).default({}),
});

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const skills = await listSkillsForUser(prisma, req.user?.id ?? null);
    res.json({ skills });
  }),
);

router.post(
  "/assessments/start",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = startBodySchema.parse(req.body ?? {});
    if (!body.skillId || !body.level) {
      throw new AppError(400, "VALIDATION_ERROR", "Both skillId and level (1, 2, or 3) are required.");
    }

    const result = await prisma.$transaction((db) =>
      startAssessmentAttempt(db, {
        userId: req.user!.id,
        skillIdOrSlug: body.skillId!,
        level: body.level!,
      }),
    );

    await audit(prisma, req, {
      actorId: req.user!.id,
      action: "SKILL_ASSESSMENT_STARTED",
      entityType: "SkillAssessmentAttempt",
      entityId: result.attempt.id,
      metadata: {
        skillId: result.attempt.skillId,
        skillName: result.attempt.skillName,
        level: result.attempt.level,
      },
    });

    res.status(201).json(result);
  }),
);

router.post(
  "/:skillId/assessments/:level/start",
  requireAuth,
  asyncHandler(async (req, res) => {
    const skillId = String(req.params.skillId ?? "").trim();
    const level = Number(req.params.level);
    if (!skillId || !Number.isInteger(level)) {
      throw new AppError(400, "VALIDATION_ERROR", "Valid skillId and level (1, 2, or 3) are required.");
    }

    const result = await prisma.$transaction((db) =>
      startAssessmentAttempt(db, {
        userId: req.user!.id,
        skillIdOrSlug: skillId,
        level,
      }),
    );

    await audit(prisma, req, {
      actorId: req.user!.id,
      action: "SKILL_ASSESSMENT_STARTED",
      entityType: "SkillAssessmentAttempt",
      entityId: result.attempt.id,
      metadata: {
        skillId: result.attempt.skillId,
        skillName: result.attempt.skillName,
        level: result.attempt.level,
      },
    });

    res.status(201).json(result);
  }),
);

router.post(
  "/attempts/:attemptId/submit",
  requireAuth,
  asyncHandler(async (req, res) => {
    const attemptId = String(req.params.attemptId ?? "").trim();
    const body = submitBodySchema.parse(req.body ?? {});

    const result = await prisma.$transaction((db) =>
      submitAssessmentAttempt(db, {
        userId: req.user!.id,
        attemptId,
        answers: body.answers,
      }),
    );

    if (result.attempt.passed) {
      await syncSpecialistToElasticIndex(prisma, req.user!.id);
    }

    await audit(prisma, req, {
      actorId: req.user!.id,
      action: result.attempt.passed ? "SKILL_ASSESSMENT_PASSED" : "SKILL_ASSESSMENT_FAILED",
      entityType: "SkillAssessmentAttempt",
      entityId: result.attempt.id,
      metadata: {
        skillId: result.attempt.skillId,
        skillName: result.attempt.skillName,
        level: result.attempt.level,
        score: result.attempt.score,
        passed: result.attempt.passed,
        verifiedLevel: result.attempt.verifiedLevel,
      },
    });

    res.json(result);
  }),
);

router.post(
  "/:skillId/assessments/:level/submit",
  requireAuth,
  asyncHandler(async (req, res) => {
    const skillId = String(req.params.skillId ?? "").trim();
    const level = Number(req.params.level);
    const body = submitBodySchema.parse(req.body ?? {});

    const result = await prisma.$transaction(async (db) => {
      let attemptId = body.attemptId;
      if (!attemptId) {
        const started = await startAssessmentAttempt(db, {
          userId: req.user!.id,
          skillIdOrSlug: skillId,
          level,
        });
        attemptId = started.attempt.id;
      }
      return submitAssessmentAttempt(db, {
        userId: req.user!.id,
        attemptId,
        answers: body.answers,
      });
    });

    if (result.attempt.passed) {
      await syncSpecialistToElasticIndex(prisma, req.user!.id);
    }

    await audit(prisma, req, {
      actorId: req.user!.id,
      action: result.attempt.passed ? "SKILL_ASSESSMENT_PASSED" : "SKILL_ASSESSMENT_FAILED",
      entityType: "SkillAssessmentAttempt",
      entityId: result.attempt.id,
      metadata: {
        skillId: result.attempt.skillId,
        skillName: result.attempt.skillName,
        level: result.attempt.level,
        score: result.attempt.score,
        passed: result.attempt.passed,
        verifiedLevel: result.attempt.verifiedLevel,
      },
    });

    res.json(result);
  }),
);

export default router;
