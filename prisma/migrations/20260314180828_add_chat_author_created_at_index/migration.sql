-- CreateIndex (for chat rate-limit: global per-author count)
CREATE INDEX "WatchChatMessage_author_createdAt_idx" ON "WatchChatMessage"("author", "createdAt");
