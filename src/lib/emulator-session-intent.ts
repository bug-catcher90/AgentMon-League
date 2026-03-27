export type EmulatorStartIntent = {
  starter?: "bulbasaur" | "charmander" | "squirtle";
  speed?: number | string;
  loadSessionId?: string;
  updatedAt: number;
};

const intents = new Map<string, EmulatorStartIntent>();

export function setEmulatorStartIntent(agentId: string, intent: Omit<EmulatorStartIntent, "updatedAt">): void {
  if (!agentId) return;
  intents.set(agentId, { ...intent, updatedAt: Date.now() });
}

export function getEmulatorStartIntent(agentId: string): EmulatorStartIntent | undefined {
  if (!agentId) return undefined;
  return intents.get(agentId);
}
