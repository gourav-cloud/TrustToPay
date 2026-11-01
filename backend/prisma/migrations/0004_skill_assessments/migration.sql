-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'PROGRAMMING',
    "description" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AssessmentStage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skillId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "passingScore" INTEGER NOT NULL DEFAULT 80,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 30,
    "maxAttemptsPerDay" INTEGER NOT NULL DEFAULT 3,
    "questionsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AssessmentStage_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SkillAssessmentAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "score" INTEGER NOT NULL DEFAULT 0,
    "answersJson" TEXT NOT NULL DEFAULT '{}',
    "feedbackJson" TEXT NOT NULL DEFAULT '[]',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "cooldownUntil" DATETIME,
    CONSTRAINT "SkillAssessmentAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SkillAssessmentAttempt_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SkillAssessmentAttempt_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "AssessmentStage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserSkillLevel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "score" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptId" TEXT,
    "verifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserSkillLevel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserSkillLevel_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Skill_slug_key" ON "Skill"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_name_key" ON "Skill"("name");

-- CreateIndex
CREATE INDEX "Skill_category_idx" ON "Skill"("category");

-- CreateIndex
CREATE INDEX "AssessmentStage_skillId_idx" ON "AssessmentStage"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentStage_skillId_level_key" ON "AssessmentStage"("skillId", "level");

-- CreateIndex
CREATE INDEX "SkillAssessmentAttempt_userId_skillId_level_idx" ON "SkillAssessmentAttempt"("userId", "skillId", "level");

-- CreateIndex
CREATE INDEX "SkillAssessmentAttempt_stageId_idx" ON "SkillAssessmentAttempt"("stageId");

-- CreateIndex
CREATE INDEX "UserSkillLevel_skillId_level_idx" ON "UserSkillLevel"("skillId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "UserSkillLevel_userId_skillId_key" ON "UserSkillLevel"("userId", "skillId");
