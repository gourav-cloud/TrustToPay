-- AlterTable
ALTER TABLE "ReviewTask" ADD COLUMN "handedOffAt" DATETIME;
ALTER TABLE "ReviewTask" ADD COLUMN "handedOffArtifactSha256" TEXT;
ALTER TABLE "ReviewTask" ADD COLUMN "callbackUrl" TEXT;
ALTER TABLE "ReviewTask" ADD COLUMN "callbackSecret" TEXT;

-- AlterTable
ALTER TABLE "VerificationRun" ADD COLUMN "executionSummaryJson" TEXT;
