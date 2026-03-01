-- CreateTable
CREATE TABLE "PublishedModel" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "version" TEXT,
    "description" TEXT DEFAULT '',
    "storageKey" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishedModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishedDataset" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "version" TEXT,
    "description" TEXT DEFAULT '',
    "format" TEXT DEFAULT 'jsonl',
    "storageKey" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishedDataset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PublishedModel_agentId_idx" ON "PublishedModel"("agentId");

-- CreateIndex
CREATE INDEX "PublishedDataset_agentId_idx" ON "PublishedDataset"("agentId");

-- AddForeignKey
ALTER TABLE "PublishedModel" ADD CONSTRAINT "PublishedModel_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishedDataset" ADD CONSTRAINT "PublishedDataset_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
