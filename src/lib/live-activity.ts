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
  | "trainer_battle_lost"
  | "fled_from_battle"
  | "battle_over"
  | "pokemon_caught"
  | "pokemon_evolved"
  | "trainer_battle_won"
  | "badge_earned"
  | "location_entered"
  | "party_grew";

type LiveActivityDraft = {
  kind: LiveActivityKind;
  message: string;
  location?: string | null;
};

function deriveEventsFromStep(payload: StepPayload, agentDisplayName: string): LiveActivityDraft[] {
  const feedback = payload.feedback;
  const effects = feedback?.effects ?? [];
  if (!effects.length) return [];

  const location = payload.state?.mapName ?? null;
  const tags = new Set(effects);
  const events: LiveActivityDraft[] = [];
  const who = agentDisplayName || "An agent";

  // Wild encounter started
  if (tags.has("wild_pokemon_appeared") || tags.has("wild_encounter")) {
    events.push({
      kind: "wild_encounter_started",
      message: `${who} encountered a wild Pokémon`,
      location,
    });
  }

  // Trainer battle started
  if (tags.has("trainer_battle") || tags.has("trainer_challenged_you")) {
    events.push({
      kind: "trainer_battle_started",
      message: `${who} was challenged by a trainer`,
      location,
    });
  }

  // Pokémon caught
  if (tags.has("caught_pokemon")) {
    events.push({
      kind: "pokemon_caught",
      message: `${who} caught a Pokémon`,
      location,
    });
  }

  // Pokémon evolved
  if (tags.has("pokemon_evolved")) {
    events.push({
      kind: "pokemon_evolved",
      message: `${who}'s Pokémon evolved`,
      location,
    });
  }

  // Trainer battle won
  if (tags.has("won_trainer_battle")) {
    events.push({
      kind: "trainer_battle_won",
      message: `${who} won the trainer battle`,
      location,
    });
  }

  // Badge earned
  if (tags.has("earned_badge")) {
    events.push({
      kind: "badge_earned",
      message: `${who} earned a gym badge`,
      location,
    });
  }

  // Trainer battle lost (defeated by trainer)
  if (tags.has("trainer_battle_lost")) {
    events.push({
      kind: "trainer_battle_lost",
      message: `${who} lost the trainer battle`,
      location,
    });
  }

  // Fled from wild battle
  if (tags.has("fled_from_battle")) {
    events.push({
      kind: "fled_from_battle",
      message: `${who} fled from the wild Pokémon`,
      location,
    });
  }

  // Generic battle over (fallback when neither trainer_battle_lost nor fled_from_battle)
  if (
    tags.has("battle_over") &&
    !tags.has("caught_pokemon") &&
    !tags.has("won_trainer_battle") &&
    !tags.has("trainer_battle_lost") &&
    !tags.has("fled_from_battle")
  ) {
    events.push({
      kind: "battle_over",
      message: `${who} left a battle`,
      location,
    });
  }

  // Party grew (e.g. received starter outside of battle)
  if (tags.has("party_grew") || tags.has("received_pokemon")) {
    events.push({
      kind: "party_grew",
      message: `${who} received a new Pokémon`,
      location,
    });
  }

  // Map / location change (cities, routes, buildings)
  const enteredTag = effects.find((e) => typeof e === "string" && e.startsWith("entered_"));
  if (enteredTag) {
    const raw = (enteredTag as string).replace(/^entered_/, "");
    const niceName = raw.replace(/_/g, " ");
    events.push({
      kind: "location_entered",
      message: `${who} entered ${niceName}`,
      location: niceName,
    });
  }

  return events;
}

export type LogLiveActivityOptions = { agentDisplayName?: string | null };

export async function logLiveActivityFromStep(
  agentId: string,
  payload: StepPayload,
  options?: LogLiveActivityOptions
): Promise<void> {
  const agentDisplayName = options?.agentDisplayName?.trim() || "An agent";
  const events = deriveEventsFromStep(payload, agentDisplayName);
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

