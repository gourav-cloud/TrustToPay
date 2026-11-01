import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { runDemoAnalysis } from "../src/services/ai/demoEngine.js";
import { verifySubmission } from "../src/services/verification.js";
import { transitionTask } from "../src/services/stateMachine.js";
import { recordTaskEvent } from "../src/lib/audit.js";
import { defaultAcceptanceCriteria, defaultSkillsFor, detectCategory, normalizeCategory } from "../src/lib/categories.js";
import { ensureDefaultSkillsSeeded, seedVerifiedSkillLevel } from "../src/services/skills/assessmentEngine.js";
import type { AnalysisInput, AnalysisOutput } from "../src/services/ai/schema.js";

const prisma = new PrismaClient();
const PASSWORD = "Demo1234!";

const DEMO_USERS = {
  requester: "agent@demo.trusttopay.dev",
  reviewer: "reviewer@demo.trusttopay.dev",
  reviewer2: "reviewer2@demo.trusttopay.dev",
  admin: "admin@demo.trusttopay.dev",
};

function daysAgo(days: number, hours = 0, minutes = 0): Date {
  return new Date(
    Date.now() - days * 24 * 60 * 60 * 1000 - hours * 60 * 60 * 1000 - minutes * 60 * 1000,
  );
}

type DocInput = AnalysisInput["documents"][number];

function analysisStatus(output: AnalysisOutput): string {
  if (output.recommendedAction === "ESCALATE_TO_HUMAN") return "ESCALATION_REQUIRED";
  if (output.recommendedAction === "REQUEST_MORE_INFORMATION") return "AWAITING_INFORMATION";
  return "ANALYSIS_COMPLETE";
}

async function createAnalyzedSession(args: {
  userId: string;
  title: string;
  question: string;
  category?: string;
  productModels: string[];
  specifications: string[];
  documents: DocInput[];
  createdAt: Date;
  resolvedAnswer?: string;
}) {
  const input: AnalysisInput = {
    question: args.question,
    productModels: args.productModels,
    specifications: args.specifications,
    documents: args.documents,
  };
  const category = normalizeCategory(args.category ?? detectCategory(input));
  input.category = category;
  const output = runDemoAnalysis(input);
  const status = args.resolvedAnswer ? "RESOLVED" : analysisStatus(output);

  const session = await prisma.agentSession.create({
    data: {
      userId: args.userId,
      title: args.title,
      question: args.question,
      category,
      productModelsJson: JSON.stringify(args.productModels),
      specificationsJson: JSON.stringify(args.specifications),
      status,
      finalAnswer: args.resolvedAnswer ?? null,
      resolvedAt: args.resolvedAnswer ? daysAgo(0, 2) : null,
      createdAt: args.createdAt,
      evidence: {
        create: args.documents.map((document) => ({
          title: document.title,
          url: document.url ?? null,
          publisher: document.publisher ?? null,
          sourceType: document.sourceType,
          content: document.content,
          isSeed: true,
          createdAt: args.createdAt,
        })),
      },
      analysisRuns: {
        create: {
          engine: "demo",
          provider: "demo",
          model: null,
          threshold: 0.75,
          outputJson: JSON.stringify(output),
          recommendedAction: output.recommendedAction,
          confidenceScore: output.confidenceScore,
          durationMs: 18,
          createdAt: args.createdAt,
        },
      },
    },
    include: { analysisRuns: true, evidence: true },
  });

  return { session, output };
}

async function attachEvidenceToTask(taskId: string, sessionId: string) {
  const evidence = await prisma.evidenceSource.findMany({ where: { sessionId } });
  if (evidence.length) {
    await prisma.evidenceSource.createMany({
      data: evidence.map((item) => ({
        taskId,
        title: item.title,
        url: item.url,
        publisher: item.publisher,
        sourceType: item.sourceType,
        content: item.content,
        isSeed: true,
      })),
    });
  }
}

/**
 * Create a review task for a non-hardware demo scenario and optionally fund it,
 * reusing the same state-machine transitions as the application.
 */
async function createSeedReviewTask(args: {
  session: { id: string; title: string; question: string; category: string };
  requesterId: string;
  output: AnalysisOutput;
  rewardMinor: number;
  createdAt: Date;
  fund?: boolean;
  acceptanceCriteria?: string;
}) {
  const category = normalizeCategory(args.session.category);
  const skills =
    args.output.suggestedReviewerSkills.length > 0
      ? args.output.suggestedReviewerSkills
      : defaultSkillsFor(category);

  const task = await prisma.reviewTask.create({
    data: {
      sessionId: args.session.id,
      requesterId: args.requesterId,
      title: args.session.title,
      question: args.session.question,
      category,
      acceptanceCriteria: args.acceptanceCriteria ?? defaultAcceptanceCriteria(category),
      requiredSkillsJson: JSON.stringify(skills),
      status: "REVIEW_TASK_CREATED",
      rewardMinor: args.rewardMinor,
      currency: "USD",
      riskLevel: "STANDARD",
      isSeed: true,
      createdAt: args.createdAt,
      reward: {
        create: {
          amountMinor: args.rewardMinor,
          currency: "USD",
          status: "PENDING",
          approvedById: args.requesterId,
          approvedAt: args.createdAt,
        },
      },
    },
    include: { reward: true },
  });

  await attachEvidenceToTask(task.id, args.session.id);

  await prisma.$transaction(async (db) => {
    await recordTaskEvent(db, {
      taskId: task.id,
      type: "TASK_CREATED",
      message: `Seeded ${category.toLowerCase()} review task created from AI escalation with an approved reward.`,
      actorId: args.requesterId,
    });
    await transitionTask(db, task.id, "AWAITING_FUNDING", {
      type: "AWAITING_FUNDING",
      message: "The requester must fund the reward before a reviewer can accept.",
      actorId: args.requesterId,
    });
    if (args.fund) {
      await transitionTask(db, task.id, "FUNDED", {
        type: "FUNDED",
        message: "Simulated funding captured.",
        actorId: args.requesterId,
        extraData: { fundedAt: args.createdAt },
      });
    }
  });

  if (args.fund) {
    await createFunding({
      taskId: task.id,
      rewardId: task.reward!.id,
      amountMinor: args.rewardMinor,
      status: "COMPLETED",
      createdAt: args.createdAt,
    });
  }
  await staggerEvents(task.id, args.createdAt);
  return task;
}

async function createFunding(args: {
  taskId: string;
  rewardId: string;
  amountMinor: number;
  status: "COMPLETED" | "FAILED";
  createdAt: Date;
  failure?: { code: string; message: string };
}) {
  return prisma.paymentTransaction.create({
    data: {
      taskId: args.taskId,
      rewardId: args.rewardId,
      type: "FUNDING",
      provider: "DEMO",
      mode: "SIMULATED",
      status: args.status,
      amountMinor: args.amountMinor,
      currency: "USD",
      orderId: `DEMO-SEED-ORDER-${randomUUID().slice(0, 12)}`,
      captureId: args.status === "COMPLETED" ? `DEMO-SEED-CAPTURE-${randomUUID().slice(0, 12)}` : null,
      idempotencyKey: `seed-fund-${args.taskId}`,
      description: "Seeded demo funding. No PayPal money moved.",
      failureCode: args.failure?.code ?? null,
      failureMessage: args.failure?.message ?? null,
      capturedAt: args.status === "COMPLETED" ? args.createdAt : null,
      createdAt: args.createdAt,
      updatedAt: args.createdAt,
    },
  });
}

async function staggerEvents(taskId: string, start: Date) {
  const events = await prisma.taskEvent.findMany({ where: { taskId } });
  const ordered = [...events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  let tick = start.getTime();
  for (const event of ordered) {
    tick += 7 * 60 * 1000;
    await prisma.taskEvent.update({ where: { id: event.id }, data: { createdAt: new Date(tick) } });
  }
}

async function main() {
  console.log("Seeding TrustToPay demo data...");
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const [agent, reviewer, reviewer2, admin] = await Promise.all([
    prisma.user.upsert({
      where: { email: DEMO_USERS.requester },
      update: { passwordHash, role: "REQUESTER", isActive: true, name: "Priya — AI Agent Operator" },
      create: {
        email: DEMO_USERS.requester,
        name: "Priya — AI Agent Operator",
        passwordHash,
        role: "REQUESTER",
        isReviewerApproved: false,
        profile: { create: { headline: "Builds documentation-grounded AI agents" } },
      },
    }),
    prisma.user.upsert({
      where: { email: DEMO_USERS.reviewer },
      update: {
        passwordHash,
        role: "REVIEWER",
        isActive: true,
        isReviewerApproved: true,
        name: "Marcus — USB-C Hardware Reviewer",
      },
      create: {
        email: DEMO_USERS.reviewer,
        name: "Marcus — USB-C Hardware Reviewer",
        passwordHash,
        role: "REVIEWER",
        isReviewerApproved: true,
        profile: {
          create: {
            headline: "USB Power Delivery and laptop charging specialist",
            bio: "Seeded demo reviewer. Reviews manufacturer documentation and per-port power limits.",
            payoutProvider: "PAYPAL",
            payoutEmail: DEMO_USERS.reviewer,
            payoutConsent: true,
          },
        },
      },
    }),
    prisma.user.upsert({
      where: { email: DEMO_USERS.reviewer2 },
      update: {
        passwordHash,
        role: "REVIEWER",
        isActive: true,
        isReviewerApproved: true,
        name: "Sam — Software, Crypto & Research Reviewer",
      },
      create: {
        email: DEMO_USERS.reviewer2,
        name: "Sam — Software, Crypto & Research Reviewer",
        passwordHash,
        role: "REVIEWER",
        isReviewerApproved: true,
        profile: {
          create: {
            headline: "Software architecture, smart contracts and technical research",
            bio: "Seeded demo reviewer. Reviews programming, crypto and conceptual questions with cited sources.",
            payoutProvider: "PAYPAL",
            payoutEmail: DEMO_USERS.reviewer2,
            payoutConsent: true,
          },
        },
      },
    }),
    prisma.user.upsert({
      where: { email: DEMO_USERS.admin },
      update: { passwordHash, role: "ADMIN", isActive: true, name: "Dana — TrustToPay Admin" },
      create: {
        email: DEMO_USERS.admin,
        name: "Dana — TrustToPay Admin",
        passwordHash,
        role: "ADMIN",
        profile: { create: { headline: "Operations and trust & safety" } },
      },
    }),
  ]);

  const demoUserIds = [agent.id, reviewer.id, reviewer2.id, admin.id];

  // Remove previous demo scenarios so the seed is repeatable.
  await prisma.reviewTask.deleteMany({ where: { requesterId: { in: demoUserIds } } });
  await prisma.agentSession.deleteMany({ where: { userId: { in: demoUserIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: demoUserIds } } });
  await prisma.skillAssessmentAttempt.deleteMany({ where: { userId: { in: demoUserIds } } });
  await prisma.userSkillLevel.deleteMany({ where: { userId: { in: demoUserIds } } });
  await prisma.reviewerSkill.deleteMany({ where: { userId: { in: demoUserIds } } });

  await ensureDefaultSkillsSeeded(prisma);

  await prisma.userProfile.upsert({
    where: { userId: reviewer.id },
    update: {
      payoutEmail: DEMO_USERS.reviewer,
      payoutConsent: true,
      headline: "USB Power Delivery and laptop charging specialist",
    },
    create: {
      userId: reviewer.id,
      payoutEmail: DEMO_USERS.reviewer,
      payoutConsent: true,
      headline: "USB Power Delivery and laptop charging specialist",
    },
  });
  await prisma.userProfile.upsert({
    where: { userId: reviewer2.id },
    update: {
      payoutEmail: DEMO_USERS.reviewer2,
      payoutConsent: true,
      headline: "Software architecture, smart contracts and technical research",
    },
    create: {
      userId: reviewer2.id,
      payoutEmail: DEMO_USERS.reviewer2,
      payoutConsent: true,
      headline: "Software architecture, smart contracts and technical research",
    },
  });
  await prisma.userProfile.upsert({
    where: { userId: agent.id },
    update: {},
    create: { userId: agent.id, headline: "Builds documentation-grounded AI agents" },
  });
  await prisma.userProfile.upsert({
    where: { userId: admin.id },
    update: {},
    create: { userId: admin.id, headline: "Operations and trust & safety" },
  });

  await prisma.reviewerSkill.createMany({
    data: [
      { userId: reviewer.id, name: "USB-C power compatibility", category: "HARDWARE", level: 3 },
      { userId: reviewer.id, name: "USB Power Delivery", category: "HARDWARE", level: 3 },
      { userId: reviewer.id, name: "Laptop charging requirements", category: "HARDWARE", level: 2 },
      { userId: reviewer.id, name: "Manufacturer documentation review", category: "CONCEPTUAL", level: 3 },
      { userId: reviewer2.id, name: "Software debugging", category: "PROGRAMMING", level: 3 },
      { userId: reviewer2.id, name: "Node.js runtime", category: "PROGRAMMING", level: 2 },
      { userId: reviewer2.id, name: "Smart contract security", category: "CRYPTO", level: 3 },
      { userId: reviewer2.id, name: "Systems design", category: "CONCEPTUAL", level: 2 },
      { userId: reviewer2.id, name: "Technical research", category: "CONCEPTUAL", level: 2 },
      { userId: reviewer2.id, name: "Consumer electronics", category: "HARDWARE", level: 1 },
    ],
  });

  await seedVerifiedSkillLevel(prisma, { userId: reviewer.id, skillSlug: "distributed-systems", targetLevel: 2 });
  await seedVerifiedSkillLevel(prisma, { userId: reviewer2.id, skillSlug: "typescript", targetLevel: 3 });
  await seedVerifiedSkillLevel(prisma, { userId: reviewer2.id, skillSlug: "python", targetLevel: 2 });
  await seedVerifiedSkillLevel(prisma, { userId: reviewer2.id, skillSlug: "smart-contracts", targetLevel: 3 });
  await seedVerifiedSkillLevel(prisma, { userId: reviewer2.id, skillSlug: "distributed-systems", targetLevel: 2 });

  /* ----------------------------------------------------------------------- */
  /* Scenario A — the primary demo: charger conflict awaiting funding        */
  /* ----------------------------------------------------------------------- */
  const chargerDocs: DocInput[] = [
    {
      title: "VoltEdge VE-65D retailer listing",
      url: "https://example.com/retailer/ve-65d",
      publisher: "TechMart (seeded sample retailer)",
      sourceType: "RETAILER",
      content:
        "VoltEdge VE-65D 65W Dual-Port USB-C Charger. Total output is 65W (45W USB-C + 20W USB-A). USB-C port: 5V/3A, 9V/3A, 12V/3A, 15V/3A, 20V/2.25A. Supports USB Power Delivery 3.0. Includes a USB-C cable. When both ports are in use, USB-C1 is limited to 45W.",
    },
    {
      title: "VE-65D marketplace quick listing",
      url: "https://example.com/market/ve-65d",
      publisher: "MarketPlace (seeded sample marketplace)",
      sourceType: "MARKETPLACE",
      content:
        "65W USB-C fast charger. PD compatible. Compact design for laptops and phones. Output up to 65W. Fast charging supported. Works with many USB-C laptops.",
    },
    {
      title: "VoltEdge support — VE-65D specifications",
      url: "https://support.example.com/voltedge/ve-65d",
      publisher: "VoltEdge Support (seeded sample manufacturer)",
      sourceType: "MANUFACTURER",
      content:
        "VE-65D combined output is 65W. USB-C1 maximum is 45W when the USB-A port is in use. USB-C1 supports USB Power Delivery 3.0 with a 20V/2.25A maximum. A 65W single-port mode is not documented for this SKU. Cable rating is not stated in this support article.",
    },
    {
      title: "AeroBook 14 (2024) charging requirements",
      url: "https://example.com/aerobook-14/charging",
      publisher: "AeroBook Documentation (seeded sample manufacturer)",
      sourceType: "MANUFACTURER",
      content:
        "AeroBook 14 (2024) charges over USB-C. The supplied charger must deliver 65W or higher USB Power Delivery at 20V/3.25A. Charging with less than 65W may be slow or unavailable under load.",
    },
  ];

  const primary = await createAnalyzedSession({
    userId: agent.id,
    title: "AeroBook 14 charger compatibility",
    question: "Is this 65W USB-C charger compatible with the specified laptop?",
    productModels: ["AeroBook 14 (2024)", "VoltEdge VE-65D"],
    specifications: [
      "Laptop charging input: USB-C, requires 65W or higher USB Power Delivery (20V/3.25A).",
      "Charger is marketed as a 65W dual-port adapter.",
    ],
    documents: chargerDocs,
    createdAt: daysAgo(2, 3),
  });

  const primaryAnalysis = primary.output;

  const taskA = await prisma.reviewTask.create({
    data: {
      sessionId: primary.session.id,
      requesterId: agent.id,
      title: primary.session.title,
      question: primary.session.question,
      category: "HARDWARE",
      acceptanceCriteria:
        "State whether the charger delivers at least 65W over USB-C in the requester's configuration.\nExplain the 45W versus 65W limitation and the single-port ambiguity.\nCite the manufacturer support documentation with a quoted excerpt.",
      requiredSkillsJson: JSON.stringify(primaryAnalysis.suggestedReviewerSkills),
      status: "REVIEW_TASK_CREATED",
      rewardMinor: 1500,
      currency: "USD",
      riskLevel: "STANDARD",
      reward: {
        create: {
          amountMinor: 1500,
          currency: "USD",
          status: "PENDING",
          approvedById: agent.id,
          approvedAt: daysAgo(2, 2),
        },
      },
      isSeed: true,
      createdAt: daysAgo(2, 2),
    },
    include: { reward: true },
  });
  await attachEvidenceToTask(taskA.id, primary.session.id);

  await prisma.$transaction(async (db) => {
    await recordTaskEvent(db, {
      taskId: taskA.id,
      type: "TASK_CREATED",
      message: "Seeded review task created from AI escalation with an approved $15.00 reward.",
      actorId: agent.id,
    });
    await transitionTask(db, taskA.id, "AWAITING_FUNDING", {
      type: "AWAITING_FUNDING",
      message: "The requester must fund the reward before a reviewer can accept. This is the primary demo task.",
      actorId: agent.id,
    });
  });
  await staggerEvents(taskA.id, daysAgo(2, 2));

  /* ----------------------------------------------------------------------- */
  /* Scenario B — funded marketplace task (ready to accept)                  */
  /* ----------------------------------------------------------------------- */
  const dockDocs: DocInput[] = [
    {
      title: "PowerDock TB4-96 product page",
      url: "https://example.com/powerdock/tb4-96",
      publisher: "PowerDock (seeded sample manufacturer)",
      sourceType: "MANUFACTURER",
      content:
        "PowerDock TB4-96 provides 96W total USB-C power. 15W is reserved for dock operation, leaving up to 85W for host laptop charging. Host charging uses USB Power Delivery at 20V/4.25A. A 100W mode is not listed.",
    },
    {
      title: "VertexBook 16 power requirements",
      url: "https://example.com/vertexbook-16/power",
      publisher: "Vertex Computing (seeded sample manufacturer)",
      sourceType: "MANUFACTURER",
      content:
        "VertexBook 16 requires 100W USB-C Power Delivery at 20V/5A for full-speed charging under sustained load. Lower wattage docks may charge slowly while the device is in use.",
    },
  ];

  const dock = await createAnalyzedSession({
    userId: agent.id,
    title: "96W dock and a 100W laptop",
    question: "Will a 96W Thunderbolt 4 dock charge a 100W laptop under sustained load?",
    productModels: ["PowerDock TB4-96", "VertexBook 16"],
    specifications: ["Laptop requires 100W USB-C PD at 20V/5A under load."],
    documents: dockDocs,
    createdAt: daysAgo(1, 6),
  });

  const taskB = await prisma.reviewTask.create({
    data: {
      sessionId: dock.session.id,
      requesterId: agent.id,
      title: dock.session.title,
      question: dock.session.question,
      category: "HARDWARE",
      acceptanceCriteria:
        "State whether the dock can sustain 100W to the laptop.\nExplain the dock overhead and the 85W host limit.\nCite the manufacturer documentation.",
      requiredSkillsJson: JSON.stringify(dock.output.suggestedReviewerSkills),
      status: "REVIEW_TASK_CREATED",
      rewardMinor: 1800,
      currency: "USD",
      reward: {
        create: {
          amountMinor: 1800,
          currency: "USD",
          status: "FUNDED",
          approvedById: agent.id,
          approvedAt: daysAgo(1, 5),
        },
      },
      isSeed: true,
      fundedAt: daysAgo(1, 4),
      createdAt: daysAgo(1, 5),
    },
    include: { reward: true },
  });
  await attachEvidenceToTask(taskB.id, dock.session.id);
  await prisma.$transaction(async (db) => {
    await recordTaskEvent(db, {
      taskId: taskB.id,
      type: "TASK_CREATED",
      message: "Seeded review task created with an approved $18.00 reward.",
      actorId: agent.id,
    });
    await transitionTask(db, taskB.id, "AWAITING_FUNDING", {
      type: "AWAITING_FUNDING",
      message: "Awaiting simulated funding.",
      actorId: agent.id,
    });
    await transitionTask(db, taskB.id, "FUNDED", {
      type: "FUNDED",
      message: "Simulated funding captured. Available in the reviewer marketplace.",
      actorId: agent.id,
      extraData: { fundedAt: daysAgo(1, 4) },
    });
  });
  await createFunding({
    taskId: taskB.id,
    rewardId: taskB.reward!.id,
    amountMinor: 1800,
    status: "COMPLETED",
    createdAt: daysAgo(1, 4),
  });
  await staggerEvents(taskB.id, daysAgo(1, 5));

  /* ----------------------------------------------------------------------- */
  /* Scenario C — rejected submission (reviewer can retry)                   */
  /* ----------------------------------------------------------------------- */
  const travelDocs: DocInput[] = [
    {
      title: "TravelVolt 45W adapter specifications",
      url: "https://example.com/travelvolt/45w",
      publisher: "TravelVolt (seeded sample manufacturer)",
      sourceType: "MANUFACTURER",
      content:
        "TravelVolt 45W USB-C adapter. USB-C output: 5V/3A, 9V/3A, 12V/3A, 15V/3A, 20V/2.25A. USB Power Delivery 3.0. Maximum output is 45W.",
    },
    {
      title: "AeroBook 14 (2024) charging requirements",
      url: "https://example.com/aerobook-14/charging",
      publisher: "AeroBook Documentation (seeded sample manufacturer)",
      sourceType: "MANUFACTURER",
      content:
        "AeroBook 14 (2024) charges over USB-C. The supplied charger must deliver 65W or higher USB Power Delivery at 20V/3.25A. Charging with less than 65W may be slow or unavailable under load.",
    },
  ];

  const travel = await createAnalyzedSession({
    userId: agent.id,
    title: "45W travel adapter for AeroBook 14",
    question: "Can a 45W USB-C travel adapter charge the AeroBook 14 at full speed?",
    productModels: ["TravelVolt 45W", "AeroBook 14 (2024)"],
    specifications: ["Laptop requires 65W USB-C PD."],
    documents: travelDocs,
    createdAt: daysAgo(3, 2),
  });

  const taskC = await prisma.reviewTask.create({
    data: {
      sessionId: travel.session.id,
      requesterId: agent.id,
      title: travel.session.title,
      question: travel.session.question,
      category: "HARDWARE",
      acceptanceCriteria:
        "State whether the adapter meets the laptop's 65W requirement.\nExplain the wattage gap.\nCite a manufacturer source.",
      requiredSkillsJson: JSON.stringify(travel.output.suggestedReviewerSkills),
      status: "REVIEW_TASK_CREATED",
      rewardMinor: 1200,
      currency: "USD",
      reward: {
        create: {
          amountMinor: 1200,
          currency: "USD",
          status: "FUNDED",
          approvedById: agent.id,
          approvedAt: daysAgo(3, 1),
        },
      },
      isSeed: true,
      fundedAt: daysAgo(3, 1),
      createdAt: daysAgo(3, 1),
    },
    include: { reward: true },
  });
  await attachEvidenceToTask(taskC.id, travel.session.id);
  const rejectedSubmission = await prisma.reviewSubmission.create({
    data: {
      taskId: taskC.id,
      reviewerId: reviewer2.id,
      answer: "It should probably work because USB-C chargers negotiate automatically.",
      explanation: "USB-C is universal, so the laptop will take what it needs.",
      confidenceScore: 55,
      sourceUrl: null,
      evidenceNotes: "I have used similar adapters before.",
      status: "REJECTED",
      isSeed: true,
      createdAt: daysAgo(3, 0, 4),
    },
  });
  const rejectedVerification = verifySubmission({
    question: taskC.question,
    acceptanceCriteria: taskC.acceptanceCriteria,
    category: taskC.category,
    rewardMinor: taskC.rewardMinor,
    currency: taskC.currency,
    riskLevel: taskC.riskLevel,
    requesterId: agent.id,
    reviewerId: reviewer2.id,
    submission: {
      answer: rejectedSubmission.answer,
      explanation: rejectedSubmission.explanation,
      confidenceScore: rejectedSubmission.confidenceScore,
      sourceUrl: rejectedSubmission.sourceUrl,
      evidenceNotes: rejectedSubmission.evidenceNotes,
    },
    suppliedEvidence: travel.session.evidence.map((item) => ({
      title: item.title,
      url: item.url,
      sourceType: item.sourceType,
    })),
    analysis: travel.output,
  });

  await prisma.$transaction(async (db) => {
    await recordTaskEvent(db, {
      taskId: taskC.id,
      type: "TASK_CREATED",
      message: "Seeded review task created with an approved $12.00 reward.",
      actorId: agent.id,
    });
    await transitionTask(db, taskC.id, "AWAITING_FUNDING", {
      type: "AWAITING_FUNDING",
      message: "Awaiting simulated funding.",
      actorId: agent.id,
    });
    await transitionTask(db, taskC.id, "FUNDED", {
      type: "FUNDED",
      message: "Simulated funding captured.",
      actorId: agent.id,
      extraData: { fundedAt: daysAgo(3, 1) },
    });
    await db.taskAssignment.create({
      data: { taskId: taskC.id, reviewerId: reviewer2.id, acceptedAt: daysAgo(3, 0, 8) },
    });
    await transitionTask(db, taskC.id, "REVIEWER_ASSIGNED", {
      type: "TASK_ACCEPTED",
      message: "Sam accepted the seeded task.",
      actorId: reviewer2.id,
    });
    await transitionTask(db, taskC.id, "SUBMISSION_RECEIVED", {
      type: "SUBMISSION_RECEIVED",
      message: "Reviewer submitted a short, unsupported answer.",
      actorId: reviewer2.id,
    });
    await transitionTask(db, taskC.id, "VERIFICATION_PENDING", {
      type: "VERIFICATION_PENDING",
      message: "Independent verification started.",
      actorId: null,
    });
    await db.verificationRun.create({
      data: {
        taskId: taskC.id,
        submissionId: rejectedSubmission.id,
        status: rejectedVerification.verificationStatus,
        decisionReason: rejectedVerification.decisionReason,
        checksPassedJson: JSON.stringify(rejectedVerification.checksPassed),
        checksFailedJson: JSON.stringify(rejectedVerification.checksFailed),
        evidenceReferencesJson: JSON.stringify(rejectedVerification.evidenceReferences),
        requiresAdminReview: false,
        engine: "AUTOMATED",
        createdAt: daysAgo(3, 0, 4),
      },
    });
    await transitionTask(db, taskC.id, "VERIFICATION_REJECTED", {
      type: "VERIFICATION_REJECTED",
      message: "Verification rejected the unsupported answer. No reward was authorized.",
      actorId: null,
    });
  });
  await createFunding({
    taskId: taskC.id,
    rewardId: taskC.reward!.id,
    amountMinor: 1200,
    status: "COMPLETED",
    createdAt: daysAgo(3, 1),
  });
  await staggerEvents(taskC.id, daysAgo(3, 1));

  /* ----------------------------------------------------------------------- */
  /* Scenario D — session awaiting more information (no task)                */
  /* ----------------------------------------------------------------------- */
  await createAnalyzedSession({
    userId: agent.id,
    title: "Power bank 140W output question",
    question: "Does the PowerCore 737 power bank deliver 140W from its USB-C port?",
    productModels: ["PowerCore 737"],
    specifications: ["Target laptop requires 140W USB-C PD 3.1."],
    documents: [
      {
        title: "PowerCore 737 specifications",
        url: "https://example.com/powercore/737",
        publisher: "PowerCore (seeded sample manufacturer)",
        sourceType: "MANUFACTURER",
        content:
          "PowerCore 737 USB-C1 supports up to 140W (28V/5A) with USB Power Delivery 3.1. USB-C2 supports up to 60W. Maximum combined output is 140W.",
      },
      {
        title: "VertexBook 16 power requirements",
        url: "https://example.com/vertexbook-16/power",
        publisher: "Vertex Computing (seeded sample manufacturer)",
        sourceType: "MANUFACTURER",
        content:
          "VertexBook 16 requires 140W USB-C Power Delivery 3.1 at 28V/5A for full-speed charging. A certified EPR cable is required.",
      },
    ],
    createdAt: daysAgo(0, 5),
  });

  /* ----------------------------------------------------------------------- */
  /* Scenario E — funding failure example                                    */
  /* ----------------------------------------------------------------------- */
  const cableDocs: DocInput[] = [
    {
      title: "240W EPR cable requirement",
      url: "https://example.com/usbif/240w-cable",
      publisher: "USB-IF (seeded sample standards document)",
      sourceType: "DOCUMENT",
      content:
        "240W charging requires an Extended Power Range cable rated for 50V/5A with an e-marker. A 100W cable rated 20V/5A is not sufficient for 240W.",
    },
    {
      title: "USB-C cable retail listing",
      url: "https://example.com/shop/100w-cable",
      publisher: "CableShop (seeded sample retailer)",
      sourceType: "RETAILER",
      content:
        "USB-C cable rated 100W, 20V/5A. Supports USB Power Delivery. Durable braided design. Not rated for Extended Power Range.",
    },
    {
      title: "HyperBook 18 power requirements",
      url: "https://example.com/hyperbook-18/power",
      publisher: "Hyper Computing (seeded sample manufacturer)",
      sourceType: "MANUFACTURER",
      content: "HyperBook 18 requires 240W USB-C PD 3.1 at 48V/5A for full-speed charging.",
    },
  ];

  const cable = await createAnalyzedSession({
    userId: agent.id,
    title: "240W charging cable requirement",
    question: "Which certified USB-C cable is required for 240W charging?",
    productModels: ["HyperBook 18"],
    specifications: ["Laptop requires 240W USB-C PD 3.1."],
    documents: cableDocs,
    createdAt: daysAgo(4, 3),
  });

  const taskE = await prisma.reviewTask.create({
    data: {
      sessionId: cable.session.id,
      requesterId: agent.id,
      title: cable.session.title,
      question: cable.session.question,
      category: "HARDWARE",
      acceptanceCriteria:
        "State the cable rating required for 240W.\nExplain why a 100W cable is insufficient.\nCite a standards or manufacturer source.",
      requiredSkillsJson: JSON.stringify(cable.output.suggestedReviewerSkills),
      status: "REVIEW_TASK_CREATED",
      rewardMinor: 1100,
      currency: "USD",
      reward: {
        create: {
          amountMinor: 1100,
          currency: "USD",
          status: "PENDING",
          approvedById: agent.id,
          approvedAt: daysAgo(4, 2),
        },
      },
      isSeed: true,
      createdAt: daysAgo(4, 2),
    },
    include: { reward: true },
  });
  await attachEvidenceToTask(taskE.id, cable.session.id);
  await prisma.$transaction(async (db) => {
    await recordTaskEvent(db, {
      taskId: taskE.id,
      type: "TASK_CREATED",
      message: "Seeded review task created with an approved $11.00 reward.",
      actorId: agent.id,
    });
    await transitionTask(db, taskE.id, "AWAITING_FUNDING", {
      type: "AWAITING_FUNDING",
      message: "Awaiting simulated funding.",
      actorId: agent.id,
    });
    await transitionTask(db, taskE.id, "FUNDING_FAILED", {
      type: "FUNDING_FAILED",
      message: "Seeded demo: the simulated funding attempt failed. No PayPal request was made.",
      actorId: agent.id,
    });
  });
  await createFunding({
    taskId: taskE.id,
    rewardId: taskE.reward!.id,
    amountMinor: 1100,
    status: "FAILED",
    createdAt: daysAgo(4, 1),
    failure: {
      code: "SIMULATED_DECLINE",
      message: "Seeded demo funding failure: simulated payment method declined. No PayPal request was made.",
    },
  });
  await staggerEvents(taskE.id, daysAgo(4, 2));

  /* ----------------------------------------------------------------------- */
  /* Scenario F — verified answer with a failed payout                       */
  /* ----------------------------------------------------------------------- */
  const passthroughDocs: DocInput[] = [
    {
      title: "PowerDock TB4-96 product page",
      url: "https://example.com/powerdock/tb4-96",
      publisher: "PowerDock (seeded sample manufacturer)",
      sourceType: "MANUFACTURER",
      content:
        "PowerDock TB4-96 provides 96W total USB-C power. 15W is reserved for dock operation, leaving up to 85W for host laptop charging at 20V/4.25A.",
    },
    {
      title: "VertexBook 16 power requirements",
      url: "https://example.com/vertexbook-16/power",
      publisher: "Vertex Computing (seeded sample manufacturer)",
      sourceType: "MANUFACTURER",
      content:
        "VertexBook 16 requires 100W USB-C Power Delivery at 20V/5A for full-speed charging under sustained load.",
    },
  ];

  const passthrough = await createAnalyzedSession({
    userId: agent.id,
    title: "85W passthrough for a 100W laptop",
    question: "Is an 85W USB-C passthrough dock sufficient for a laptop that requires 100W?",
    productModels: ["PowerDock TB4-96", "VertexBook 16"],
    specifications: ["Laptop requires 100W USB-C PD."],
    documents: passthroughDocs,
    createdAt: daysAgo(1, 2),
  });

  const taskF = await prisma.reviewTask.create({
    data: {
      sessionId: passthrough.session.id,
      requesterId: agent.id,
      title: passthrough.session.title,
      question: passthrough.session.question,
      category: "HARDWARE",
      acceptanceCriteria:
        "State whether 85W meets the laptop's 100W requirement.\nExplain the difference between total dock power and host passthrough power.\nCite manufacturer documentation with a quoted excerpt.",
      requiredSkillsJson: JSON.stringify(passthrough.output.suggestedReviewerSkills),
      status: "REVIEW_TASK_CREATED",
      rewardMinor: 2000,
      currency: "USD",
      reward: {
        create: {
          amountMinor: 2000,
          currency: "USD",
          status: "FUNDED",
          approvedById: agent.id,
          approvedAt: daysAgo(1, 1),
        },
      },
      isSeed: true,
      fundedAt: daysAgo(1, 1),
      createdAt: daysAgo(1, 1),
    },
    include: { reward: true },
  });
  await attachEvidenceToTask(taskF.id, passthrough.session.id);

  const passedAnswer =
    "The 85W host passthrough is not compatible with the VertexBook 16's 100W requirement. The dock reserves 15W for its own operation, so the laptop can receive at most 85W over USB-C Power Delivery at 20V/4.25A, below the documented 100W at 20V/5A. The laptop may charge slowly or stop charging under sustained load.";
  const passedExplanation =
    "The power budget must be evaluated at the host port, not the dock's total rating. The manufacturer states that 15W is reserved, and the laptop documentation requires 100W. I compared both manufacturer sources and quoted the passthrough limit.";
  const passedSubmission = await prisma.reviewSubmission.create({
    data: {
      taskId: taskF.id,
      reviewerId: reviewer.id,
      answer: passedAnswer,
      explanation: passedExplanation,
      confidenceScore: 88,
      sourceUrl: "https://support.example.com/powerdock/tb4-96",
      evidenceNotes:
        'PowerDock documentation states: "15W is reserved for dock operation, leaving up to 85W for host laptop charging at 20V/4.25A." VertexBook documentation states: "requires 100W USB-C Power Delivery at 20V/5A."',
      status: "ACCEPTED",
      isSeed: true,
      createdAt: daysAgo(0, 8),
    },
  });
  const passedVerification = verifySubmission({
    question: taskF.question,
    acceptanceCriteria: taskF.acceptanceCriteria,
    category: taskF.category,
    rewardMinor: taskF.rewardMinor,
    currency: taskF.currency,
    riskLevel: taskF.riskLevel,
    requesterId: agent.id,
    reviewerId: reviewer.id,
    submission: {
      answer: passedSubmission.answer,
      explanation: passedSubmission.explanation,
      confidenceScore: passedSubmission.confidenceScore,
      sourceUrl: passedSubmission.sourceUrl,
      evidenceNotes: passedSubmission.evidenceNotes,
    },
    suppliedEvidence: passthrough.session.evidence.map((item) => ({
      title: item.title,
      url: item.url,
      sourceType: item.sourceType,
    })),
    analysis: passthrough.output,
  });
  if (passedVerification.verificationStatus !== "PASSED") {
    throw new Error(
      `Seed scenario F expected PASSED verification, got ${passedVerification.verificationStatus}. Failed: ${passedVerification.checksFailed
        .map((check) => check.id)
        .join(", ")}`,
    );
  }

  await prisma.$transaction(async (db) => {
    await recordTaskEvent(db, {
      taskId: taskF.id,
      type: "TASK_CREATED",
      message: "Seeded review task created with an approved $20.00 reward.",
      actorId: agent.id,
    });
    await transitionTask(db, taskF.id, "AWAITING_FUNDING", {
      type: "AWAITING_FUNDING",
      message: "Awaiting simulated funding.",
      actorId: agent.id,
    });
    await transitionTask(db, taskF.id, "FUNDED", {
      type: "FUNDED",
      message: "Simulated funding captured.",
      actorId: agent.id,
      extraData: { fundedAt: daysAgo(1, 1) },
    });
    await db.taskAssignment.create({
      data: { taskId: taskF.id, reviewerId: reviewer.id, acceptedAt: daysAgo(0, 10) },
    });
    await transitionTask(db, taskF.id, "REVIEWER_ASSIGNED", {
      type: "TASK_ACCEPTED",
      message: "Marcus accepted the seeded task.",
      actorId: reviewer.id,
    });
    await transitionTask(db, taskF.id, "SUBMISSION_RECEIVED", {
      type: "SUBMISSION_RECEIVED",
      message: "Reviewer submitted an evidence-backed answer.",
      actorId: reviewer.id,
    });
    await transitionTask(db, taskF.id, "VERIFICATION_PENDING", {
      type: "VERIFICATION_PENDING",
      message: "Independent verification started.",
      actorId: null,
    });
    const verification = await db.verificationRun.create({
      data: {
        taskId: taskF.id,
        submissionId: passedSubmission.id,
        status: passedVerification.verificationStatus,
        decisionReason: passedVerification.decisionReason,
        checksPassedJson: JSON.stringify(passedVerification.checksPassed),
        checksFailedJson: JSON.stringify(passedVerification.checksFailed),
        evidenceReferencesJson: JSON.stringify(passedVerification.evidenceReferences),
        requiresAdminReview: passedVerification.requiresAdminReview,
        engine: "AUTOMATED",
        createdAt: daysAgo(0, 8),
      },
    });
    await transitionTask(db, taskF.id, "VERIFIED", {
      type: "VERIFIED",
      message: "Independent verification passed.",
      actorId: null,
      extraData: { verifiedAt: daysAgo(0, 7), finalAnswer: passedAnswer },
      metadata: { verificationRunId: verification.id },
    });
    await db.reward.update({
      where: { taskId: taskF.id },
      data: {
        status: "AUTHORIZED",
        approvedById: agent.id,
        approvedAt: daysAgo(0, 7),
      },
    });
    await transitionTask(db, taskF.id, "PAYMENT_READY", {
      type: "PAYMENT_READY",
      message: "Reward authorized after verification. Payout is separate from verification.",
      actorId: agent.id,
    });
    await transitionTask(db, taskF.id, "PAYMENT_PROCESSING", {
      type: "PAYMENT_PROCESSING",
      message: "Seeded payout attempt started.",
      actorId: agent.id,
    });
    await db.reward.update({ where: { taskId: taskF.id }, data: { status: "PROCESSING" } });
    await transitionTask(db, taskF.id, "PAYOUT_FAILED", {
      type: "PAYOUT_FAILED",
      message: "Seeded demo: simulated payout failed. The verified answer is preserved; payment is unresolved.",
      actorId: agent.id,
    });
    await db.reward.update({ where: { taskId: taskF.id }, data: { status: "AUTHORIZED" } });
  });
  await createFunding({
    taskId: taskF.id,
    rewardId: taskF.reward!.id,
    amountMinor: 2000,
    status: "COMPLETED",
    createdAt: daysAgo(1, 1),
  });
  await prisma.paymentTransaction.create({
    data: {
      taskId: taskF.id,
      rewardId: taskF.reward!.id,
      type: "PAYOUT",
      provider: "DEMO",
      mode: "SIMULATED",
      status: "FAILED",
      amountMinor: 2000,
      currency: "USD",
      payoutBatchId: `DEMO-SEED-PAYOUT-${randomUUID().slice(0, 8)}`,
      payoutItemId: `DEMO-SEED-ITEM-${randomUUID().slice(0, 8)}`,
      idempotencyKey: `seed-payout-failed-${taskF.id}`,
      recipientEmail: DEMO_USERS.reviewer,
      description: "Seeded demo payout failure. No PayPal request was made.",
      failureCode: "SIMULATED_PAYOUT_FAILURE",
      failureMessage: "Seeded demo payout failure (simulated). Reconcile or retry to demonstrate recovery.",
      createdAt: daysAgo(0, 6),
    },
  });
  await staggerEvents(taskF.id, daysAgo(1, 1));

  /* ----------------------------------------------------------------------- */
  /* Scenario G — completed review with simulated payout                     */
  /* ----------------------------------------------------------------------- */
  const miniPcDocs: DocInput[] = [
    {
      title: "MiniPC X1 power requirements",
      url: "https://example.com/minipc-x1/power",
      publisher: "MiniPC Labs (seeded sample)",
      sourceType: "DOCUMENT",
      content:
        "MiniPC X1 requires 45W USB-C Power Delivery at 20V/2.25A. It does not ship with a charger.",
    },
    {
      title: "GaN 65W charger marketplace listing",
      url: "https://example.com/market/gan-65w",
      publisher: "MarketPlace (seeded sample marketplace)",
      sourceType: "MARKETPLACE",
      content:
        "65W USB-C GaN charger with USB Power Delivery 3.0. Output 20V/3.25A. Compact travel design. Works with many laptops and mini PCs.",
    },
  ];

  const miniPc = await createAnalyzedSession({
    userId: agent.id,
    title: "65W charger for a 45W mini PC",
    question: "Can a 65W USB-C PD charger power a 45W mini PC?",
    productModels: ["MiniPC X1", "GaN 65W charger"],
    specifications: ["Mini PC requires 45W USB-C PD."],
    documents: miniPcDocs,
    createdAt: daysAgo(7, 2),
  });
  const miniPcAnswer =
    "The 65W USB-C Power Delivery charger is compatible with the 45W MiniPC X1. The charger's 65W wattage rating exceeds the mini PC's 45W requirement, and both operate at a 20V voltage over USB-C Power Delivery 3.0. The charger supplies up to 65W at 20V/3.25A while the mini PC requires 45W at 20V/2.25A, leaving headroom, so it should power the mini PC at full speed.";

  const taskG = await prisma.reviewTask.create({
    data: {
      sessionId: miniPc.session.id,
      requesterId: agent.id,
      title: miniPc.session.title,
      question: miniPc.session.question,
      category: "HARDWARE",
      acceptanceCriteria:
        "Confirm whether the charger meets the mini PC requirement.\nState the wattage and voltage involved.\nCite an independent source with a quoted excerpt.",
      requiredSkillsJson: JSON.stringify(miniPc.output.suggestedReviewerSkills),
      status: "REVIEW_TASK_CREATED",
      rewardMinor: 1400,
      currency: "USD",
      reward: {
        create: {
          amountMinor: 1400,
          currency: "USD",
          status: "PAID",
          approvedById: agent.id,
          approvedAt: daysAgo(7, 1),
          paidAt: daysAgo(6, 18),
        },
      },
      isSeed: true,
      fundedAt: daysAgo(7, 1),
      verifiedAt: daysAgo(6, 20),
      completedAt: daysAgo(6, 18),
      finalAnswer: miniPcAnswer,
      createdAt: daysAgo(7, 1),
    },
    include: { reward: true },
  });
  await attachEvidenceToTask(taskG.id, miniPc.session.id);
  const finalMiniPcSubmission = await prisma.reviewSubmission.create({
    data: {
      taskId: taskG.id,
      reviewerId: reviewer.id,
      answer: miniPcAnswer,
      explanation:
        "I compared the charger's per-port USB-C PD wattage and voltage rating with the mini PC's documented 45W requirement. 65W exceeds 45W, and both use USB-C Power Delivery at a 20V voltage, so the adapter is sufficient. I also checked that the charger is a single-port unit, avoiding shared-output ambiguity, and cited an independent source below.",
      confidenceScore: 90,
      sourceUrl: "https://docs.example.net/minipc/x1-power",
      evidenceNotes:
        'Independent manufacturer source, quoted excerpt: MiniPC documentation states: "MiniPC X1 requires 45W USB-C Power Delivery at 20V/2.25A." The charger listing states: "Output 20V/3.25A" with USB PD 3.0.',
      status: "ACCEPTED",
      isSeed: true,
      createdAt: daysAgo(6, 20),
    },
  });
  const miniPcVerification = verifySubmission({
    question: taskG.question,
    acceptanceCriteria: taskG.acceptanceCriteria,
    category: taskG.category,
    rewardMinor: taskG.rewardMinor,
    currency: taskG.currency,
    riskLevel: taskG.riskLevel,
    requesterId: agent.id,
    reviewerId: reviewer.id,
    submission: {
      answer: finalMiniPcSubmission.answer,
      explanation: finalMiniPcSubmission.explanation,
      confidenceScore: finalMiniPcSubmission.confidenceScore,
      sourceUrl: finalMiniPcSubmission.sourceUrl,
      evidenceNotes: finalMiniPcSubmission.evidenceNotes,
    },
    suppliedEvidence: miniPc.session.evidence.map((item) => ({
      title: item.title,
      url: item.url,
      sourceType: item.sourceType,
    })),
    analysis: miniPc.output,
  });
  if (miniPcVerification.verificationStatus !== "PASSED") {
    throw new Error(
      `Seed scenario G expected PASSED verification, got ${miniPcVerification.verificationStatus}. Failed: ${miniPcVerification.checksFailed
        .map((check) => check.id)
        .join(", ")}`,
    );
  }

  await prisma.$transaction(async (db) => {
    await recordTaskEvent(db, {
      taskId: taskG.id,
      type: "TASK_CREATED",
      message: "Seeded review task created with an approved $14.00 reward.",
      actorId: agent.id,
    });
    await transitionTask(db, taskG.id, "AWAITING_FUNDING", {
      type: "AWAITING_FUNDING",
      message: "Awaiting simulated funding.",
      actorId: agent.id,
    });
    await transitionTask(db, taskG.id, "FUNDED", {
      type: "FUNDED",
      message: "Simulated funding captured.",
      actorId: agent.id,
      extraData: { fundedAt: daysAgo(7, 1) },
    });
    await db.taskAssignment.create({
      data: { taskId: taskG.id, reviewerId: reviewer.id, acceptedAt: daysAgo(6, 22), status: "COMPLETED", completedAt: daysAgo(6, 18) },
    });
    await transitionTask(db, taskG.id, "REVIEWER_ASSIGNED", {
      type: "TASK_ACCEPTED",
      message: "Marcus accepted the seeded task.",
      actorId: reviewer.id,
    });
    await transitionTask(db, taskG.id, "SUBMISSION_RECEIVED", {
      type: "SUBMISSION_RECEIVED",
      message: "Reviewer submitted an evidence-backed answer.",
      actorId: reviewer.id,
    });
    await transitionTask(db, taskG.id, "VERIFICATION_PENDING", {
      type: "VERIFICATION_PENDING",
      message: "Independent verification started.",
      actorId: null,
    });
    const verification = await db.verificationRun.create({
      data: {
        taskId: taskG.id,
        submissionId: finalMiniPcSubmission.id,
        status: miniPcVerification.verificationStatus,
        decisionReason: miniPcVerification.decisionReason,
        checksPassedJson: JSON.stringify(miniPcVerification.checksPassed),
        checksFailedJson: JSON.stringify(miniPcVerification.checksFailed),
        evidenceReferencesJson: JSON.stringify(miniPcVerification.evidenceReferences),
        requiresAdminReview: miniPcVerification.requiresAdminReview,
        engine: "AUTOMATED",
        createdAt: daysAgo(6, 20),
      },
    });
    await transitionTask(db, taskG.id, "VERIFIED", {
      type: "VERIFIED",
      message: "Independent verification passed.",
      actorId: null,
      extraData: { verifiedAt: daysAgo(6, 20) },
      metadata: { verificationRunId: verification.id },
    });
    await transitionTask(db, taskG.id, "PAYMENT_READY", {
      type: "PAYMENT_READY",
      message: "Reward authorized after verification.",
      actorId: agent.id,
    });
    await transitionTask(db, taskG.id, "PAYMENT_PROCESSING", {
      type: "PAYMENT_PROCESSING",
      message: "Simulated payout started.",
      actorId: agent.id,
    });
    await transitionTask(db, taskG.id, "PAYMENT_PAID", {
      type: "PAYMENT_PAID",
      message: "Simulated reviewer payout completed. No PayPal money moved.",
      actorId: agent.id,
    });
    await transitionTask(db, taskG.id, "ORIGINAL_TASK_RESUMED", {
      type: "ORIGINAL_TASK_RESUMED",
      message: "The original AI session resumed with the verified human answer.",
      actorId: agent.id,
    });
    await transitionTask(db, taskG.id, "COMPLETED", {
      type: "COMPLETED",
      message: "Verified answer delivered to the original AI session.",
      actorId: agent.id,
    });
  });
  await createFunding({
    taskId: taskG.id,
    rewardId: taskG.reward!.id,
    amountMinor: 1400,
    status: "COMPLETED",
    createdAt: daysAgo(7, 1),
  });
  await prisma.paymentTransaction.create({
    data: {
      taskId: taskG.id,
      rewardId: taskG.reward!.id,
      type: "PAYOUT",
      provider: "DEMO",
      mode: "SIMULATED",
      status: "COMPLETED",
      amountMinor: 1400,
      currency: "USD",
      payoutBatchId: `DEMO-SEED-PAYOUT-${randomUUID().slice(0, 8)}`,
      payoutItemId: `DEMO-SEED-ITEM-${randomUUID().slice(0, 8)}`,
      idempotencyKey: `seed-payout-completed-${taskG.id}`,
      recipientEmail: DEMO_USERS.reviewer,
      description: "Seeded demo payout. No PayPal money moved.",
      paidAt: daysAgo(6, 18),
      createdAt: daysAgo(6, 19),
    },
  });
  await staggerEvents(taskG.id, daysAgo(7, 1));

  /* ----------------------------------------------------------------------- */
  /* Scenario H — programming question awaiting funding                      */
  /* ----------------------------------------------------------------------- */
  const programmingDocs: DocInput[] = [
    {
      title: "worker-pool.ts excerpt",
      url: "https://gist.example.com/worker-pool",
      publisher: "Internal code excerpt (seeded sample)",
      sourceType: "DOCUMENT",
      content:
        "The worker pool is configured with pool size is 4 workers. Each job calls await fetch inside a for loop. The retry limit is 3 attempts. The queue stops draining after four jobs because every worker waits on a response that has no timeout.",
    },
    {
      title: "Deployment runbook",
      url: "https://docs.example.com/runbooks/worker-pool",
      publisher: "Platform team (seeded sample)",
      sourceType: "DOCUMENT",
      content:
        "The worker pool is configured with pool size is 12 workers. The retry limit is 3 attempts. The HTTP timeout is 30 seconds. This runbook does not describe a semaphore or backpressure mechanism.",
    },
  ];

  const programmingSession = await createAnalyzedSession({
    userId: agent.id,
    title: "Worker pool stalls after deploy",
    question:
      "Our Node 20 worker pool stalls after a deploy. Why does the queue stop draining, and is the retry configuration safe?",
    category: "PROGRAMMING",
    productModels: ["worker-pool.ts"],
    specifications: ["Node 20.11", "Jobs are fetched from an internal HTTP API."],
    documents: programmingDocs,
    createdAt: daysAgo(1, 5),
  });

  const taskH = await createSeedReviewTask({
    session: programmingSession.session,
    requesterId: agent.id,
    output: programmingSession.output,
    rewardMinor: 1200,
    createdAt: daysAgo(1, 4),
  });

  /* ----------------------------------------------------------------------- */
  /* Scenario I — funded crypto review (marketplace, ready to accept)        */
  /* ----------------------------------------------------------------------- */
  const cryptoDocs: DocInput[] = [
    {
      title: "Vault.sol audit notes",
      url: "https://example.com/audits/vault-permit",
      publisher: "Independent audit (seeded sample)",
      sourceType: "DOCUMENT",
      content:
        "The permit function hashes the owner, spender, value, nonce, deadline and chainId. The contract does not validate chainId against block.chainid. Nonces are incremented after a successful transfer.",
    },
    {
      title: "Vault deployment checklist",
      url: "https://docs.example.com/vault/deployment",
      publisher: "Protocol team (seeded sample)",
      sourceType: "DOCUMENT",
      content:
        "The vault validates chainId against block.chainid before accepting a permit. The domain separator is cached at deployment time. Nonces are not incremented.",
    },
  ];

  const cryptoSession = await createAnalyzedSession({
    userId: agent.id,
    title: "EIP-2612 permit replay safety review",
    question:
      "Is the EIP-2612 permit signature in our vault contract replay-safe across chain forks and after a chainId change?",
    category: "CRYPTO",
    productModels: ["Vault.sol"],
    specifications: ["Ethereum mainnet", "Permit signatures are submitted by a relayer."],
    documents: cryptoDocs,
    createdAt: daysAgo(3, 6),
  });

  const taskI = await createSeedReviewTask({
    session: cryptoSession.session,
    requesterId: agent.id,
    output: cryptoSession.output,
    rewardMinor: 1800,
    createdAt: daysAgo(3, 5),
    fund: true,
  });

  /* ----------------------------------------------------------------------- */
  /* Scenario J — funded conceptual architecture review                      */
  /* ----------------------------------------------------------------------- */
  const conceptualDocs: DocInput[] = [
    {
      title: "Architecture review notes",
      url: "https://docs.example.com/architecture/order-service",
      publisher: "Platform architecture group (seeded sample)",
      sourceType: "DOCUMENT",
      content:
        "Peak throughput is 1,000 messages per second. Direct HTTP calls add 40 ms of latency. The team has no dedicated platform engineer.",
    },
    {
      title: "Vendor benchmark summary",
      url: "https://example.com/benchmarks/message-queue",
      publisher: "Queue vendor benchmark (seeded sample)",
      sourceType: "DOCUMENT",
      content:
        "Peak throughput is 5,000 messages per second. Queues add 40 ms of latency and require dedicated operational ownership.",
    },
  ];

  const conceptualSession = await createAnalyzedSession({
    userId: agent.id,
    title: "Message queue vs direct HTTP",
    question:
      "Should our team replace direct HTTP calls between services with a message queue, or is the added operational complexity not worth it?",
    category: "CONCEPTUAL",
    productModels: [],
    specifications: [],
    documents: conceptualDocs,
    createdAt: daysAgo(4, 4),
  });

  const taskJ = await createSeedReviewTask({
    session: conceptualSession.session,
    requesterId: agent.id,
    output: conceptualSession.output,
    rewardMinor: 1600,
    createdAt: daysAgo(4, 3),
    fund: true,
  });

  // Demo notifications for the bell menu.
  await prisma.notification.createMany({
    data: [
      {
        userId: agent.id,
        title: "Review task awaiting funding",
        body: "Fund the $15.00 reward for the AeroBook 14 charger review to make it available to reviewers.",
        link: `/app/tasks/${taskA.id}`,
        createdAt: daysAgo(2, 1),
      },
      {
        userId: agent.id,
        title: "Verified answer ready",
        body: "The mini PC review completed. Resume the original session to receive the verified answer.",
        link: `/app/sessions/${miniPc.session.id}`,
        readAt: daysAgo(6, 17),
        createdAt: daysAgo(6, 18),
      },
      {
        userId: reviewer.id,
        title: "Payout failure needs attention",
        body: "The seeded payout for the 85W passthrough review failed. The verified answer is preserved.",
        link: `/app/tasks/${taskF.id}`,
        createdAt: daysAgo(0, 6),
      },
    ],
  });

  console.log("");
  console.log("Seed complete.");
  console.log("Demo accounts (password: Demo1234!):");
  console.log(`  Requester: ${DEMO_USERS.requester}`);
  console.log(`  Reviewer:  ${DEMO_USERS.reviewer}`);
  console.log(`  Reviewer2: ${DEMO_USERS.reviewer2}`);
  console.log(`  Admin:     ${DEMO_USERS.admin}`);
  console.log("");
  console.log("Scenarios:");
  console.log(`  A awaiting funding: ${taskA.id}`);
  console.log(`  B marketplace task: ${taskB.id}`);
  console.log(`  C rejected submission: ${taskC.id}`);
  console.log(`  E funding failure: ${taskE.id}`);
  console.log(`  F verified answer + payout failure: ${taskF.id}`);
  console.log(`  G completed review: ${taskG.id}`);
  console.log(`  H programming awaiting funding: ${taskH.id}`);
  console.log(`  I crypto marketplace task: ${taskI.id}`);
  console.log(`  J conceptual marketplace task: ${taskJ.id}`);
  console.log("");
  console.log("All seeded payments are simulated and labelled. No PayPal request was made.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
