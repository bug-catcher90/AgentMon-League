-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "goalKind" TEXT NOT NULL,
    "goalValue" INTEGER NOT NULL,
    "championId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonAgentStat" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "pokedexOwned" INTEGER NOT NULL DEFAULT 0,
    "pokedexSeen" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "badgesCount" INTEGER NOT NULL DEFAULT 0,
    "playtimeSeconds" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeasonAgentStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionSummary" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "playtimeSeconds" INTEGER NOT NULL,
    "pokedexOwned" INTEGER NOT NULL DEFAULT 0,
    "pokedexSeen" INTEGER NOT NULL DEFAULT 0,
    "badgesCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Season_number_key" ON "Season"("number");

-- CreateIndex
CREATE INDEX "Season_status_idx" ON "Season"("status");

-- CreateIndex
CREATE INDEX "SeasonAgentStat_seasonId_idx" ON "SeasonAgentStat"("seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonAgentStat_seasonId_agentId_key" ON "SeasonAgentStat"("seasonId", "agentId");

-- CreateIndex
CREATE INDEX "SessionSummary_agentId_endedAt_idx" ON "SessionSummary"("agentId", "endedAt");

-- CreateIndex
CREATE INDEX "SessionSummary_endedAt_idx" ON "SessionSummary"("endedAt");

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_championId_fkey" FOREIGN KEY ("championId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonAgentStat" ADD CONSTRAINT "SeasonAgentStat_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonAgentStat" ADD CONSTRAINT "SeasonAgentStat_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSummary" ADD CONSTRAINT "SessionSummary_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
