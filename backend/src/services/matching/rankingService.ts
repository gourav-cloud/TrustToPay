import type { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "../../lib/errors.js";
import { parseJson } from "../../lib/json.js";
import { ensureDefaultSkillsSeeded, getSkillLevelName } from "../skills/assessmentEngine.js";
import {
  discoverSpecialistCandidatesForTask,
  type ElasticDiscoveryResult,
  type IndexedCompletedOutcome,
} from "../elastic/specialistIndexService.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

export const DEFAULT_MAX_ACTIVE_WORKLOAD = 3;

export type RankingBreakdown = {
  skillSignal: number;
  verificationSignal: number;
  speedSignal: number;
  weightedSkill: number;
  weightedVerification: number;
  weightedSpeed: number;
};

export type RankedSpecialist = {
  specialistId: string;
  name: string;
  email: string;
  matchedSkillId: string | null;
  matchedSkillName: string;
  verifiedSkillLevel: number;
  verifiedSkillLevelName: string;
  minimumSkillLevelRequired: number;
  score: number;
  elasticHybridScore?: number | null;
  breakdown: RankingBreakdown;
  stats: {
    activeWorkload: number;
    maxWorkload: number;
    acceptedSubmissions: number;
    rejectedSubmissions: number;
    avgTurnaroundMinutes: number | null;
  };
  reasons: string[];
};

export type ExcludedSpecialist = {
  specialistId: string;
  email: string;
  reasonCode:
    | "REQUESTER_SELF"
    | "INACTIVE_OR_UNAPPROVED"
    | "ALREADY_OFFERED"
    | "WORKLOAD_LIMIT_REACHED"
    | "MISSING_VERIFIED_SKILL"
    | "INSUFFICIENT_SKILL_LEVEL";
  detail: string;
};

export type TaskRankingResult = {
  taskId: string;
  requiredSkills: string[];
  requiredSkillId: string | null;
  minimumSkillLevel: number;
  eligible: RankedSpecialist[];
  excluded: ExcludedSpecialist[];
  discovery: {
    mode: ElasticDiscoveryResult["mode"];
    usedElastic: boolean;
    fallbackReason: string | null;
    embeddingModel: string | null;
    candidateCount: number;
    similarCompletedTasks: IndexedCompletedOutcome[];
    durationMs: number;
  };
  evaluatedAt: string;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function levelToSignalScore(level: number, assessmentScore = 80): number {
  const base = level >= 3 ? 95 : level === 2 ? 80 : 60;
  const bonus = Math.min(5, Math.max(0, (assessmentScore - 80) * 0.25));
  return Math.min(100, round2(base + bonus));
}

export async function rankSpecialistsForTask(
  db: DbClient,
  taskId: string,
  options: {
    maxActiveWorkload?: number;
    excludeAlreadyOffered?: boolean;
  } = {},
): Promise<TaskRankingResult> {
  await ensureDefaultSkillsSeeded(db);

  const maxActiveWorkload = options.maxActiveWorkload ?? DEFAULT_MAX_ACTIVE_WORKLOAD;
  const excludeAlreadyOffered = options.excludeAlreadyOffered ?? true;

  const task = await db.reviewTask.findUnique({
    where: { id: taskId },
    include: {
      offers: true,
    },
  });

  if (!task) {
    throw new AppError(404, "TASK_NOT_FOUND", "Review task not found.");
  }

  const requiredSkillsList = parseJson<string[]>(task.requiredSkillsJson, []);
  const minimumSkillLevel = Math.max(1, Math.min(3, task.minimumSkillLevel || 1));

  // Query Elastic hybrid discovery layer (gracefully falls back to DB when disabled/unavailable)
  const elasticDiscovery = await discoverSpecialistCandidatesForTask({
    id: task.id,
    title: task.title,
    question: task.question,
    acceptanceCriteria: task.acceptanceCriteria,
    category: task.category,
    requiredSkills: requiredSkillsList,
    minimumSkillLevel,
  });

  // Resolve catalog skills matching task.requiredSkillId or task.requiredSkillsJson
  const allCatalogSkills = await db.skill.findMany({
    where: { isActive: true },
  });

  const targetCatalogSkills = allCatalogSkills.filter((skill) => {
    if (task.requiredSkillId) {
      if (
        skill.id === task.requiredSkillId ||
        skill.slug.toLowerCase() === task.requiredSkillId.toLowerCase() ||
        skill.name.toLowerCase() === task.requiredSkillId.toLowerCase()
      ) {
        return true;
      }
    }
    return requiredSkillsList.some(
      (reqName) =>
        reqName.trim().toLowerCase() === skill.name.toLowerCase() ||
        reqName.trim().toLowerCase() === skill.slug.toLowerCase(),
    );
  });

  const alreadyOfferedIds = new Set(task.offers.map((o) => o.specialistId));

  // Database remains the authoritative source of truth for all candidate records & hard eligibility checks
  const reviewers = await db.user.findMany({
    where: {
      role: "REVIEWER",
    },
    include: {
      verifiedSkillLevels: {
        include: {
          skill: true,
        },
      },
      skills: true,
      assignments: {
        select: {
          id: true,
          status: true,
          acceptedAt: true,
          completedAt: true,
        },
      },
      submissions: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  const eligible: RankedSpecialist[] = [];
  const excluded: ExcludedSpecialist[] = [];

  for (const candidate of reviewers) {
    // Hard Filter 1: Never match the requester of the task
    if (candidate.id === task.requesterId) {
      excluded.push({
        specialistId: candidate.id,
        email: candidate.email,
        reasonCode: "REQUESTER_SELF",
        detail: "Specialist is the task requester.",
      });
      continue;
    }

    // Hard Filter 2: Account must be active and approved in relational DB
    if (!candidate.isActive || !candidate.isReviewerApproved) {
      excluded.push({
        specialistId: candidate.id,
        email: candidate.email,
        reasonCode: "INACTIVE_OR_UNAPPROVED",
        detail: "Specialist account is not active or not approved.",
      });
      continue;
    }

    // Hard Filter 3: Exclude specialists who already received an offer for this task (when enabled)
    if (excludeAlreadyOffered && alreadyOfferedIds.has(candidate.id)) {
      excluded.push({
        specialistId: candidate.id,
        email: candidate.email,
        reasonCode: "ALREADY_OFFERED",
        detail: "Specialist was already included in an earlier offer batch for this task.",
      });
      continue;
    }

    // Hard Filter 4: Active workload must be below maxActiveWorkload
    const activeWorkload = candidate.assignments.filter((a) => a.status === "ACTIVE").length;
    if (activeWorkload >= maxActiveWorkload) {
      excluded.push({
        specialistId: candidate.id,
        email: candidate.email,
        reasonCode: "WORKLOAD_LIMIT_REACHED",
        detail: `Active workload (${activeWorkload}) has reached the limit (${maxActiveWorkload}).`,
      });
      continue;
    }

    // Hard Filter 5: Verified skill level requirement (revalidated against DB)
    let matchedSkillId: string | null = null;
    let matchedSkillName = "";
    let verifiedSkillLevel = 0;
    let assessmentScore = 80;
    let highestInsufficientLevel = 0;

    const elasticHit = elasticDiscovery.hitsBySpecialistId[candidate.id] ?? null;

    if (targetCatalogSkills.length > 0 || task.requiredSkillId) {
      const targetIds = new Set(targetCatalogSkills.map((s) => s.id));
      const matchingVerified = candidate.verifiedSkillLevels.filter((ul) => targetIds.has(ul.skillId));

      for (const ul of matchingVerified) {
        if (ul.level >= minimumSkillLevel && ul.level > verifiedSkillLevel) {
          verifiedSkillLevel = ul.level;
          matchedSkillId = ul.skillId;
          matchedSkillName = ul.skill.name;
          assessmentScore = ul.score;
        } else if (ul.level < minimumSkillLevel && ul.level > highestInsufficientLevel) {
          highestInsufficientLevel = ul.level;
        }
      }
    } else if (requiredSkillsList.length > 0) {
      // Fallback for tasks with custom skill strings not in catalog: check verifiedSkillLevels or ReviewerSkill
      const normalizedRequired = requiredSkillsList.map((s) => s.trim().toLowerCase());
      for (const ul of candidate.verifiedSkillLevels) {
        if (
          normalizedRequired.includes(ul.skill.name.toLowerCase()) ||
          normalizedRequired.includes(ul.skill.slug.toLowerCase())
        ) {
          if (ul.level >= minimumSkillLevel && ul.level > verifiedSkillLevel) {
            verifiedSkillLevel = ul.level;
            matchedSkillId = ul.skillId;
            matchedSkillName = ul.skill.name;
            assessmentScore = ul.score;
          } else if (ul.level < minimumSkillLevel) {
            highestInsufficientLevel = Math.max(highestInsufficientLevel, ul.level);
          }
        }
      }

      if (verifiedSkillLevel === 0) {
        for (const rs of candidate.skills) {
          if (normalizedRequired.includes(rs.name.toLowerCase())) {
            if (rs.level >= minimumSkillLevel && rs.level > verifiedSkillLevel) {
              verifiedSkillLevel = Math.min(3, rs.level);
              matchedSkillName = rs.name;
            } else if (rs.level < minimumSkillLevel) {
              highestInsufficientLevel = Math.max(highestInsufficientLevel, rs.level);
            }
          }
        }
      }

      // Semantic discovery enhancement: when custom task phrasing does not match an exact catalog keyword,
      // Elastic hybrid search can discover a specialist whose DB-verified skill meets minimumSkillLevel.
      if (verifiedSkillLevel === 0 && elasticHit) {
        for (const ul of candidate.verifiedSkillLevels) {
          if (ul.level >= minimumSkillLevel && ul.level > verifiedSkillLevel) {
            verifiedSkillLevel = ul.level;
            matchedSkillId = ul.skillId;
            matchedSkillName = ul.skill.name;
            assessmentScore = ul.score;
          } else if (ul.level < minimumSkillLevel) {
            highestInsufficientLevel = Math.max(highestInsufficientLevel, ul.level);
          }
        }
      }
    } else if (elasticHit) {
      // Task had no explicit requiredSkills array; use highest DB-verified skill for Elastic-discovered candidate
      for (const ul of candidate.verifiedSkillLevels) {
        if (ul.level >= minimumSkillLevel && ul.level > verifiedSkillLevel) {
          verifiedSkillLevel = ul.level;
          matchedSkillId = ul.skillId;
          matchedSkillName = ul.skill.name;
          assessmentScore = ul.score;
        } else if (ul.level < minimumSkillLevel) {
          highestInsufficientLevel = Math.max(highestInsufficientLevel, ul.level);
        }
      }
    }

    if (verifiedSkillLevel < minimumSkillLevel) {
      excluded.push({
        specialistId: candidate.id,
        email: candidate.email,
        reasonCode: highestInsufficientLevel > 0 ? "INSUFFICIENT_SKILL_LEVEL" : "MISSING_VERIFIED_SKILL",
        detail:
          highestInsufficientLevel > 0
            ? `Specialist holds L${highestInsufficientLevel} but task requires minimum L${minimumSkillLevel}.`
            : `Specialist does not hold a verified skill record for required skill(s).`,
      });
      continue;
    }

    // Signal 1: Skill Level Match (50% weight)
    const skillSignal = levelToSignalScore(verifiedSkillLevel, assessmentScore);
    const weightedSkill = round2(skillSignal * 0.5);

    // Signal 2: Historical Verification Success Rate (30% weight)
    const acceptedSubmissions = candidate.submissions.filter((s) => s.status === "ACCEPTED").length;
    const rejectedSubmissions = candidate.submissions.filter((s) => s.status === "REJECTED").length;
    const gradedTotal = acceptedSubmissions + rejectedSubmissions;
    const verificationSignal =
      gradedTotal > 0 ? round2((acceptedSubmissions / gradedTotal) * 100) : 75;
    const weightedVerification = round2(verificationSignal * 0.3);

    // Signal 3: Response Speed & Workload Availability (20% weight)
    const completedWithTimes = candidate.assignments.filter(
      (a) => a.status === "COMPLETED" && a.completedAt && a.acceptedAt,
    );
    let avgTurnaroundMinutes: number | null = null;
    let speedSubScore = 80; // Neutral baseline for new specialists
    if (completedWithTimes.length > 0) {
      const totalMinutes = completedWithTimes.reduce((sum, a) => {
        const diffMs = Math.max(0, a.completedAt!.getTime() - a.acceptedAt.getTime());
        return sum + diffMs / 60_000;
      }, 0);
      avgTurnaroundMinutes = round2(totalMinutes / completedWithTimes.length);
      // 15 min or faster = 100, 120 min = 65, 240+ min = 40
      speedSubScore = round2(Math.max(40, Math.min(100, 100 - Math.max(0, avgTurnaroundMinutes - 15) * 0.35)));
    }
    const availabilitySubScore = round2(((maxActiveWorkload - activeWorkload) / maxActiveWorkload) * 100);
    const speedSignal = round2(speedSubScore * 0.5 + availabilitySubScore * 0.5);
    const weightedSpeed = round2(speedSignal * 0.2);

    const totalScore = round2(weightedSkill + weightedVerification + weightedSpeed);
    const verifiedSkillLevelName = getSkillLevelName(verifiedSkillLevel);

    const reasons = [
      `Verified ${matchedSkillName} at L${verifiedSkillLevel} (${verifiedSkillLevelName}) meets minimum L${minimumSkillLevel} (skill weight: ${weightedSkill}/50)`,
      gradedTotal > 0
        ? `Historical verification rate: ${acceptedSubmissions}/${gradedTotal} (${verificationSignal}%, weight: ${weightedVerification}/30)`
        : `Historical verification baseline: ${verificationSignal}% (no prior graded submissions, weight: ${weightedVerification}/30)`,
      `Workload ${activeWorkload}/${maxActiveWorkload} active tasks${
        avgTurnaroundMinutes !== null ? `, avg turnaround ${avgTurnaroundMinutes}m` : ""
      } (speed/availability weight: ${weightedSpeed}/20)`,
    ];

    if (elasticHit) {
      reasons.push(
        `Elastic hybrid discovery match (hybrid score: ${elasticHit.hybridScore}${
          elasticHit.vectorScore !== null ? `, cosine similarity: ${elasticHit.vectorScore}` : ""
        })`,
      );
    }

    eligible.push({
      specialistId: candidate.id,
      name: candidate.name,
      email: candidate.email,
      matchedSkillId,
      matchedSkillName,
      verifiedSkillLevel,
      verifiedSkillLevelName,
      minimumSkillLevelRequired: minimumSkillLevel,
      score: totalScore,
      elasticHybridScore: elasticHit?.hybridScore ?? null,
      breakdown: {
        skillSignal,
        verificationSignal,
        speedSignal,
        weightedSkill,
        weightedVerification,
        weightedSpeed,
      },
      stats: {
        activeWorkload,
        maxWorkload: maxActiveWorkload,
        acceptedSubmissions,
        rejectedSubmissions,
        avgTurnaroundMinutes,
      },
      reasons,
    });
  }

  // Sort descending by total score, then by verifiedSkillLevel, then by fewer active tasks,
  // then by Elastic hybrid discovery relevance, then deterministic ID
  eligible.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.verifiedSkillLevel !== a.verifiedSkillLevel) return b.verifiedSkillLevel - a.verifiedSkillLevel;
    if (a.stats.activeWorkload !== b.stats.activeWorkload) {
      return a.stats.activeWorkload - b.stats.activeWorkload;
    }
    const elasticA = a.elasticHybridScore ?? -1;
    const elasticB = b.elasticHybridScore ?? -1;
    if (elasticB !== elasticA) return elasticB - elasticA;
    return a.specialistId.localeCompare(b.specialistId);
  });

  return {
    taskId: task.id,
    requiredSkills: requiredSkillsList,
    requiredSkillId: task.requiredSkillId ?? (targetCatalogSkills[0]?.id ?? null),
    minimumSkillLevel,
    eligible,
    excluded,
    discovery: {
      mode: elasticDiscovery.mode,
      usedElastic: elasticDiscovery.usedElastic,
      fallbackReason: elasticDiscovery.fallbackReason,
      embeddingModel: elasticDiscovery.embeddingModel,
      candidateCount: elasticDiscovery.candidateIds?.length ?? eligible.length,
      similarCompletedTasks: elasticDiscovery.similarCompletedTasks,
      durationMs: elasticDiscovery.durationMs,
    },
    evaluatedAt: new Date().toISOString(),
  };
}
