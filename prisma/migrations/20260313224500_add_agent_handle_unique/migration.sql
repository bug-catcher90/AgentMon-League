-- Ensure Agent.handle, when present, is unique so external clients
-- can use a stable handle/externalId to avoid accidental re-registration.
CREATE UNIQUE INDEX "Agent_handle_key" ON "Agent"("handle");

