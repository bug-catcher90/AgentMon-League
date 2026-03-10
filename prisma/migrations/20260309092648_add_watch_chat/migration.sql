-- CreateTable
CREATE TABLE "WatchChatMessage" (
    "id" TEXT NOT NULL,
    "streamAgentId" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WatchChatMessage_streamAgentId_createdAt_idx" ON "WatchChatMessage"("streamAgentId", "createdAt");
