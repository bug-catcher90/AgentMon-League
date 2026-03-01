-- AlterTable
ALTER TABLE "AgentState" ADD COLUMN     "areaX" INTEGER,
ADD COLUMN     "areaY" INTEGER,
ADD COLUMN     "interiorId" TEXT,
ADD COLUMN     "interiorX" INTEGER,
ADD COLUMN     "interiorY" INTEGER,
ADD COLUMN     "regionId" TEXT;

-- CreateIndex
CREATE INDEX "AgentState_worldId_regionId_idx" ON "AgentState"("worldId", "regionId");
