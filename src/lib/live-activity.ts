import { prisma } from "@/lib/db";

type Feedback = {
  effects?: string[];
  message?: string;
};

type StepPayload = {
  state?: {
    mapName?: string;
  };
  feedback?: Feedback;
};

type LiveActivityKind =
  | "wild_encounter_started"
  | "trainer_battle_started"
  | "battle_over"
  | "pokemon_caught"
  | "trainer_battle_won"
  | "badge_earned"
  | "location_entered"
  | "party_grew";

type LiveActivityDraft = {
  kind: LiveActivityKind;
  message: string;
  location?: string | null;
};

function deriveEventsFromStep(payload: StepPayload): LiveActivityDraft[] {
  const feedback = payload.feedback;
  const effects = feedback?.effects ?? [];
  if (!effects.length) return [];

  const location = payload.state?.mapName ?? null;
  const tags = new Set(effects);
  const events: LiveActivityDraft[] = [];

  // Wild encounter started
  if (tags.has("wild_pokemon_appeared") || tags.has("wild_encounter")) {
    events.push({
      kind: "wild_encounter_started",
      message: "Encountered a wild Pokémon",
      location,
    });
  }

  // Trainer battle started
  if (tags.has("trainer_battle") || tags.has("trainer_challenged_you")) {
    events.push({
      kind: "trainer_battle_started",
      message: "Started a battle with a trainer",
      location,
    });
  }

  // Pokémon caught
  if (tags.has("caught_pokemon")) {
    events.push({
      kind: "pokemon_caught",
      message: "Caught a Pokémon",
      location,
    });
  }

  // Trainer battle won / badge earned
  if (tags.has("won_trainer_battle")) {
    events.push({
      kind: "trainer_battle_won",
      message: "Won a trainer battle",
      location,
    });
  }

  if (tags.has("earned_badge")) {
    events.push({
      kind: "badge_earned",
      message: "Earned a gym badge",
      location,
    });
  }

  // Party grew (e.g. received starter outside of battle)
  if (tags.has("party_grew") || tags.has("received_pokemon")) {
    events.push({
      kind: "party_grew",
      message: "Received a new Pokémon",
      location,
    });
  }

  // Map / location change
  const enteredTag = effects.find((e) => e.startsWith("entered_"));
  if (enteredTag) {
    const raw = enteredTag.replace(/^entered_/, "");
    const niceName = raw.replace(/_/g, " ");
    events.push({
      kind: "location_entered",
      message: `Entered ${niceName}`,
      location: niceName,
    });
  }

  // Generic battle over (fled or was defeated)
  if (tags.has("battle_over") && !tags.has("caught_pokemon") && !tags.has("won_trainer_battle")) {
    events.push({
      kind: "battle_over",
      message: "Left a battle",
      location,
    });
  }

  return events;
}

export async function logLiveActivityFromStep(agentId: string, payload: StepPayload): Promise<void> {
  const events = deriveEventsFromStep(payload);
  if (!events.length) return;

  try {
    await prisma.liveActivityEvent.createMany({
      data: events.map((e) => ({
        agentId,
        kind: e.kind,
        message: e.message,
        location: e.location ?? null,
      })),
    });
  } catch {
    // Best-effort only — never block gameplay on activity logging.
  }
}

