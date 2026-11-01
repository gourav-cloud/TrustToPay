-- AlterTable
ALTER TABLE "ReviewTask" ADD COLUMN "requiredSkillId" TEXT;
ALTER TABLE "ReviewTask" ADD COLUMN "minimumSkillLevel" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "TaskOffer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "specialistId" TEXT NOT NULL,
    "batchNumber" INTEGER NOT NULL DEFAULT 1,
    "rank" INTEGER NOT NULL DEFAULT 1,
    "score" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reasonsJson" TEXT NOT NULL DEFAULT '{}',
    "expiresAt" DATETIME NOT NULL,
    "respondedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskOffer_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ReviewTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskOffer_specialistId_fkey" FOREIGN KEY ("specialistId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TaskOffer_taskId_status_idx" ON "TaskOffer"("taskId", "status");

-- CreateIndex
CREATE INDEX "TaskOffer_specialistId_status_idx" ON "TaskOffer"("specialistId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TaskOffer_taskId_specialistId_key" ON "TaskOffer"("taskId", "specialistId");
