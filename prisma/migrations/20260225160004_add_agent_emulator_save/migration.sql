-- CreateTable
CREATE TABLE "AgentEmulatorSave" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "label" TEXT,
    "state" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentEmulatorSave_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentEmulatorSave_agentId_createdAt_idx" ON "AgentEmulatorSave"("agentId", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentEmulatorSave" ADD CONSTRAINT "AgentEmulatorSave_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
