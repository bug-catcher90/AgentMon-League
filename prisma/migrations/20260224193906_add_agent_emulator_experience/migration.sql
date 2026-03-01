-- CreateTable
CREATE TABLE "AgentEmulatorExperience" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL DEFAULT 0,
    "stateBefore" JSONB NOT NULL,
    "action" TEXT NOT NULL,
    "stateAfter" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentEmulatorExperience_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentEmulatorExperience_agentId_createdAt_idx" ON "AgentEmulatorExperience"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentEmulatorExperience_agentId_stepIndex_idx" ON "AgentEmulatorExperience"("agentId", "stepIndex");

-- AddForeignKey
ALTER TABLE "AgentEmulatorExperience" ADD CONSTRAINT "AgentEmulatorExperience_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
