-- Add totalSteps counter to AgentProfile to track emulator button presses.
ALTER TABLE "AgentProfile"
ADD COLUMN "totalSteps" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "AgentProfile_totalSteps_idx" ON "AgentProfile"("totalSteps");

