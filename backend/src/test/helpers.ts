import bcrypt from "bcryptjs";
import request from "supertest";
import { expect } from "vitest";
import { prisma } from "../db.js";
import { createApp } from "../app.js";
import type { AnalysisOutput } from "../services/ai/schema.js";

export const app = createApp();
export const TEST_PASSWORD = "Demo1234!";
export type TestAgent = ReturnType<typeof request.agent>;

export function agent(): TestAgent {
  return request.agent(app);
}

/**
 * Delete every row in dependency order. SQLite has no TRUNCATE, and keeping the
 * order explicit avoids relying on cascade behaviour between suites.
 */
export async function resetDatabase(): Promise<void> {
  await prisma.paymentWebhookEvent.deleteMany();
  await prisma.verificationRun.deleteMany();
  await prisma.submissionArtifact.deleteMany();
  await prisma.reviewSubmission.deleteMany();
  await prisma.taskOffer.deleteMany();
  await prisma.taskAssignment.deleteMany();
  await prisma.paymentTransaction.deleteMany();
  await prisma.taskEvent.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.evidenceSource.deleteMany();
  await prisma.reward.deleteMany();
  await prisma.reviewTask.deleteMany();
  await prisma.analysisRun.deleteMany();
  await prisma.agentSession.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.agentApiKey.deleteMany();
  await prisma.skillAssessmentAttempt.deleteMany();
  await prisma.userSkillLevel.deleteMany();
  await prisma.assessmentStage.deleteMany();
  await prisma.skill.deleteMany();
  await prisma.reviewerSkill.deleteMany();
  await prisma.userProfile.deleteMany();
  await prisma.user.deleteMany();
}

type Role = "REQUESTER" | "REVIEWER" | "ADMIN";

export async function createUser(
  role: Role,
  options: {
    email?: string;
    name?: string;
    isReviewerApproved?: boolean;
    payoutEmail?: string | null;
    payoutConsent?: boolean;
  } = {},
) {
  const email = options.email ?? `${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.dev`;
  return prisma.user.create({
    data: {
      email,
      name: options.name ?? `Test ${role.toLowerCase()}`,
      passwordHash: await bcrypt.hash(TEST_PASSWORD, 4),
      role,
      isReviewerApproved: options.isReviewerApproved ?? role === "REVIEWER",
      profile: {
        create: {
          payoutEmail: options.payoutEmail ?? null,
          payoutConsent: options.payoutConsent ?? false,
        },
      },
    },
    include: { profile: true },
  });
}

/** Create the three fixed demo accounts used by /auth/demo-login. */
export async function seedDemoUsers() {
  const [requester, reviewer, admin] = await Promise.all([
    createUser("REQUESTER", { email: "agent@demo.trusttopay.dev", name: "Demo Agent" }),
    createUser("REVIEWER", { email: "reviewer@demo.trusttopay.dev", name: "Demo Reviewer" }),
    createUser("ADMIN", { email: "admin@demo.trusttopay.dev", name: "Demo Admin" }),
  ]);
  return { requester, reviewer, admin };
}

export async function loginAs(target: TestAgent, email: string, password = TEST_PASSWORD) {
  const response = await target.post("/api/v1/auth/login").send({ email, password });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body.user;
}

/** A realistic conflict: a 65W headline charger whose USB-C port is capped at 45W. */
export const chargerDocuments = [
  {
    title: "VoltEdge VE-65D retailer listing",
    url: "https://example.com/retailer/ve-65d",
    publisher: "TechMart (sample retailer)",
    sourceType: "RETAILER" as const,
    content:
      "VoltEdge VE-65D 65W Dual-Port USB-C Charger. Total output is 65W (45W USB-C + 20W USB-A). USB-C port: 5V/3A, 9V/3A, 12V/3A, 15V/3A, 20V/2.25A. Supports USB Power Delivery 3.0. Includes a USB-C cable. When both ports are in use, USB-C1 is limited to 45W.",
  },
  {
    title: "VE-65D marketplace quick listing",
    url: "https://example.com/market/ve-65d",
    publisher: "MarketPlace (sample marketplace)",
    sourceType: "MARKETPLACE" as const,
    content:
      "65W USB-C fast charger. PD compatible. Compact design for laptops and phones. Output up to 65W. Fast charging supported. Works with many USB-C laptops.",
  },
  {
    title: "VoltEdge support — VE-65D specifications",
    url: "https://support.example.com/voltedge/ve-65d",
    publisher: "VoltEdge Support (sample manufacturer)",
    sourceType: "MANUFACTURER" as const,
    content:
      "VE-65D combined output is 65W. USB-C1 maximum is 45W when the USB-A port is in use. USB-C1 supports USB Power Delivery 3.0 with a 20V/2.25A maximum. A 65W single-port mode is not documented for this SKU. Cable rating is not stated in this support article.",
  },
  {
    title: "AeroBook 14 (2024) charging requirements",
    url: "https://example.com/aerobook-14/charging",
    publisher: "AeroBook Documentation (sample manufacturer)",
    sourceType: "MANUFACTURER" as const,
    content:
      "AeroBook 14 (2024) charges over USB-C. The supplied charger must deliver 65W or higher USB Power Delivery at 20V/3.25A. Charging with less than 65W may be slow or unavailable under load.",
  },
];

export const sessionInput = {
  title: "AeroBook 14 charger compatibility",
  question: "Is this 65W USB-C charger compatible with the specified laptop?",
  productModels: ["AeroBook 14 (2024)", "VoltEdge VE-65D"],
  specifications: [
    "Laptop charging input: USB-C, requires 65W or higher USB Power Delivery (20V/3.25A).",
    "Charger is marketed as a 65W dual-port adapter.",
  ],
  documents: chargerDocuments,
};

export const acceptanceCriteria =
  "State whether the charger is compatible\n" +
  "Cite the USB-C port wattage limit\n" +
  "Explain the voltage and protocol requirement";

export async function createChargerSession(target: TestAgent) {
  const response = await target.post("/api/v1/sessions").send(sessionInput);
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body.session as { id: string; status: string; title: string };
}

export async function analyzeChargerSession(target: TestAgent, sessionId: string) {
  const response = await target.post(`/api/v1/sessions/${sessionId}/analyze`);
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body as {
    analysis: AnalysisOutput & { id: string; confidenceScore: number; recommendedAction: string };
    sessionStatus: string;
    mode: string;
    threshold: number;
  };
}

/** Fund a task through the simulated PayPal order + capture flow. */
export async function fundTask(target: TestAgent, taskId: string) {
  const order = await target.post("/api/v1/payments/paypal/orders").send({ taskId });
  expect(order.status, JSON.stringify(order.body)).toBe(201);
  const orderId = order.body.paypal.orderId as string;
  expect(order.body.paypal.mode).toBe("SIMULATED");

  const capture = await target.post(`/api/v1/payments/paypal/orders/${encodeURIComponent(orderId)}/capture`);
  expect(capture.status, JSON.stringify(capture.body)).toBe(200);
  expect(capture.body.completed).toBe(true);
  return capture.body;
}

export const goodSubmission = {
  answer:
    "The VoltEdge VE-65D is not compatible with the AeroBook 14 at full charging speed. " +
    "Its USB-C port is limited to 45W when the USB-A port is in use, which is below the laptop's 65W Power Delivery requirement at 20V/3.25A.",
  explanation:
    "I compared the documented USB-C port maximum of 45W against the AeroBook's requirement of 65W USB Power Delivery at 20V/3.25A. " +
    "Because 45W is below the requirement, the charger cannot deliver full-speed charging in this configuration, and a 65W single-port mode is not documented for this SKU.",
  confidenceScore: 92,
  sourceUrl: "https://www.usb.org/usb-charger",
  evidenceNotes:
    'Independent source, quoted excerpt: "USB Power Delivery 3.0 delivers up to 100W over USB-C and negotiates voltage and current." ' +
    "The manufacturer support article states the USB-C1 maximum is 45W when USB-A is in use.",
};

export const weakSubmission = {
  answer: "This charger seems fine to me.",
  explanation: "I looked at the listing and it says 65 watts, which should be enough.",
  confidenceScore: 40,
};
