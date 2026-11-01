-- AlterTable
ALTER TABLE "ReviewSubmission" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ReviewSubmission" ADD COLUMN "sha256Digest" TEXT;

-- AlterTable
ALTER TABLE "VerificationRun" ADD COLUMN "artifactVersion" INTEGER;
ALTER TABLE "VerificationRun" ADD COLUMN "artifactSha256" TEXT;
ALTER TABLE "VerificationRun" ADD COLUMN "invalidatedAt" DATETIME;

-- CreateTable
CREATE TABLE "SubmissionArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sha256Digest" TEXT NOT NULL,
    "fileManifestJson" TEXT NOT NULL DEFAULT '[]',
    "filesJson" TEXT NOT NULL DEFAULT '[]',
    "patchText" TEXT,
    "archiveUrl" TEXT,
    "totalSizeBytes" INTEGER NOT NULL DEFAULT 0,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "isQuarantined" BOOLEAN NOT NULL DEFAULT false,
    "invalidatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubmissionArtifact_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ReviewTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SubmissionArtifact_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ReviewSubmission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionArtifact_submissionId_key" ON "SubmissionArtifact"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionArtifact_taskId_version_key" ON "SubmissionArtifact"("taskId", "version");

-- CreateIndex
CREATE INDEX "SubmissionArtifact_sha256Digest_idx" ON "SubmissionArtifact"("sha256Digest");
