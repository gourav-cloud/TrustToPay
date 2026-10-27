-- Add an explicit category to agent sessions so a review task can inherit the
-- domain of the original question instead of defaulting to USB-C hardware.
ALTER TABLE "AgentSession" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'CONCEPTUAL';
