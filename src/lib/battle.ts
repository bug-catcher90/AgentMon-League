/**
 * Turn-based battle engine (Gen1-style).
 * All resolution is server-side; transcript lines are generated.
 */

import { getSpeciesById, getMove } from "./content";

export interface CreatureInstance {
  instanceId: string;
  speciesId: string;
  nickname?: string;
  level: number;
  currentHp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  special: number;
  moves: { moveId: string; pp: number; maxPp: number }[];
  status?: "burn" | "freeze" | "paralysis" | "poison" | "sleep" | "confusion";
  statusTurns?: number;
}

export interface BattleSide {
  creatures: CreatureInstance[];
  activeIndex: number;
  agentId: string;
}

export interface BattleState {
  matchId: string;
  type: "WILD" | "TRAINER" | "GYM" | "LEAGUE";
  turn: number;
  sides: [BattleSide, BattleSide]; // [player, opponent]
  transcript: string[];
  phase: "active" | "switch" | "fainted" | "ended";
  winnerId: string | null;
}

const GEN1_TYPE_CHART: Record<string, Record<string, number>> = {
  normal: { rock: 0.5, ghost: 0 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5 },
  ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0 },
  poison: { grass: 2, poison: 0.5, ground: 0.5, bug: 2, rock: 0.5, ghost: 0.5 },
  ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2 },
  flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5 },
  bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5 },
  rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2 },
  ghost: { normal: 0, psychic: 2, ghost: 2 },
  dragon: { dragon: 2 },
};

const PHYSICAL_TYPES = new Set(["normal", "fighting", "flying", "poison", "ground", "rock", "bug", "ghost"]);

function getEffectiveness(moveType: string, defenderTypes: string[]): number {
  let mult = 1;
  for (const t of defenderTypes) {
    const m = GEN1_TYPE_CHART[moveType]?.[t];
    if (m !== undefined) mult *= m;
  }
  return mult;
}

function isPhysical(type: string): boolean {
  return PHYSICAL_TYPES.has(type);
}

function statFromLevel(base: number, level: number): number {
  return Math.floor((((base * 2 + 0) * level) / 100) + level + 10);
}

function statBattleFromLevel(base: number, level: number): number {
  return Math.floor((((base * 2 + 0) * level) / 100) + 5);
}

export function createCreatureInstance(speciesId: string, level: number, instanceId?: string): CreatureInstance {
  const species = getSpeciesById(speciesId);
  if (!species) throw new Error(`Unknown species: ${speciesId}`);

  const maxHp = statFromLevel(species.base.hp, level);
  const attack = statBattleFromLevel(species.base.attack, level);
  const defense = statBattleFromLevel(species.base.defense, level);
  const speed = statBattleFromLevel(species.base.speed, level);
  const special = statBattleFromLevel(species.base.special, level);

  const moves = species.moves.slice(0, 4).map((moveId) => {
    const move = getMove(moveId);
    const maxPp = move ? Math.max(1, Math.floor((move.pp * 1.6))) : 35;
    return { moveId, pp: maxPp, maxPp };
  });

  return {
    instanceId: instanceId ?? `creature_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    speciesId,
    level,
    currentHp: maxHp,
    maxHp,
    attack,
    defense,
    speed,
    special,
    moves,
  };
}

function getDisplayName(c: CreatureInstance): string {
  return c.nickname ?? getSpeciesById(c.speciesId)?.name ?? c.speciesId;
}

export function resolveTurn(
  state: BattleState,
  actionA: { type: "move"; moveIndex: number } | { type: "switch"; creatureIndex: number } | { type: "item"; itemId: string; target?: string } | { type: "run" } | { type: "capture"; itemId: string },
  actionB?: { type: "move"; moveIndex: number } | { type: "switch"; creatureIndex: number }
): { newState: BattleState; transcriptLines: string[] } {
  const lines: string[] = [];
  const sides = JSON.parse(JSON.stringify(state.sides)) as [BattleSide, BattleSide];
  let phase = state.phase;
  let winnerId = state.winnerId;

  const sideA = sides[0];
  const sideB = sides[1];
  const activeA = sideA.creatures[sideA.activeIndex];
  const activeB = sideB.creatures[sideB.activeIndex];

  if (!activeA || activeA.currentHp <= 0) {
    phase = "fainted";
    winnerId = sideB.agentId;
    lines.push(`${getDisplayName(activeB)} wins!`);
    return {
      newState: { ...state, sides, turn: state.turn + 1, transcript: [...state.transcript, ...lines], phase, winnerId },
      transcriptLines: lines,
    };
  }
  if (!activeB || activeB.currentHp <= 0) {
    phase = "ended";
    winnerId = sideA.agentId;
    lines.push("Opponent has no more creatures!");
    return {
      newState: { ...state, sides, turn: state.turn + 1, transcript: [...state.transcript, ...lines], phase, winnerId },
      transcriptLines: lines,
    };
  }

  if (actionA.type === "run") {
    lines.push("Got away safely!");
    phase = "ended";
    winnerId = sideB.agentId;
    return {
      newState: { ...state, sides, turn: state.turn + 1, transcript: [...state.transcript, ...lines], phase, winnerId },
      transcriptLines: lines,
    };
  }

  if (actionA.type === "switch" && actionA.creatureIndex >= 0 && actionA.creatureIndex < sideA.creatures.length) {
    const next = sideA.creatures[actionA.creatureIndex];
    if (next.currentHp > 0) {
      sideA.activeIndex = actionA.creatureIndex;
      lines.push(`Go! ${getDisplayName(next)}!`);
      return {
        newState: { ...state, sides, turn: state.turn + 1, transcript: [...state.transcript, ...lines], phase: "active" },
        transcriptLines: lines,
      };
    }
  }

  if (actionA.type === "capture") {
    // Capture attempt: simplified Gen1 catch formula
    lines.push("Agent threw a ball!");
    const rand = Math.random();
    const hpRatio = activeB.currentHp / activeB.maxHp;
    const catchChance = 1 - hpRatio * 0.5;
    if (rand < catchChance) {
      lines.push("Caught!");
      phase = "ended";
      winnerId = sideA.agentId;
    } else {
      lines.push("The creature broke free!");
    }
    return {
      newState: { ...state, sides, turn: state.turn + 1, transcript: [...state.transcript, ...lines], phase, winnerId },
      transcriptLines: lines,
    };
  }

  if (actionA.type === "move" && actionB?.type === "move") {
    const moveA = getMove(activeA.moves[actionA.moveIndex]?.moveId ?? "");
    const moveB = getMove(activeB.moves[actionB.moveIndex]?.moveId ?? "");

    if (moveA && activeA.moves[actionA.moveIndex]?.pp > 0) {
      activeA.moves[actionA.moveIndex].pp--;
      lines.push(`${getDisplayName(activeA)} used ${moveA.name}!`);

      if (moveA.power > 0) {
        const isPhys = isPhysical(moveA.type);
        const attackStat = isPhys ? activeA.attack : activeA.special;
        const defenseStat = isPhys ? activeB.defense : activeB.special;
        const effectiveness = getEffectiveness(moveA.type, getSpeciesById(activeB.speciesId)?.types ?? []);
        let damage = Math.floor((((2 * activeA.level) / 5 + 2) * moveA.power * (attackStat / defenseStat)) / 50) + 2;
        damage = Math.floor(damage * (Math.random() * 0.15 + 0.85));
        if (effectiveness >= 2) lines.push("It's super effective!");
        if (effectiveness > 0 && effectiveness < 1) lines.push("It's not very effective...");
        if (effectiveness === 0) lines.push("It doesn't affect the opponent...");
        damage = Math.floor(damage * effectiveness);
        activeB.currentHp = Math.max(0, activeB.currentHp - damage);
      }
    }

    if (activeB.currentHp <= 0) {
      lines.push(`${getDisplayName(activeB)} fainted!`);
      phase = "ended";
      winnerId = sideA.agentId;
      return {
        newState: { ...state, sides, turn: state.turn + 1, transcript: [...state.transcript, ...lines], phase, winnerId },
        transcriptLines: lines,
      };
    }

    if (moveB && activeB.moves[actionB.moveIndex]?.pp > 0) {
      activeB.moves[actionB.moveIndex].pp--;
      lines.push(`${getDisplayName(activeB)} used ${moveB.name}!`);
      if (moveB.power > 0) {
        const isPhys = isPhysical(moveB.type);
        const attackStat = isPhys ? activeB.attack : activeB.special;
        const defenseStat = isPhys ? activeA.defense : activeA.special;
        const effectiveness = getEffectiveness(moveB.type, getSpeciesById(activeA.speciesId)?.types ?? []);
        let damage = Math.floor((((2 * activeB.level) / 5 + 2) * moveB.power * (attackStat / defenseStat)) / 50) + 2;
        damage = Math.floor(damage * (Math.random() * 0.15 + 0.85));
        if (effectiveness >= 2) lines.push("It's super effective!");
        if (effectiveness > 0 && effectiveness < 1) lines.push("It's not very effective...");
        damage = Math.floor(damage * effectiveness);
        activeA.currentHp = Math.max(0, activeA.currentHp - damage);
      }
    }

    if (activeA.currentHp <= 0) {
      lines.push(`${getDisplayName(activeA)} fainted!`);
      phase = "fainted";
      winnerId = sideB.agentId;
    }
  }

  return {
    newState: {
      ...state,
      sides,
      turn: state.turn + 1,
      transcript: [...state.transcript, ...lines],
      phase,
      winnerId: winnerId ?? state.winnerId,
    },
    transcriptLines: lines,
  };
}

export function createWildBattleState(
  matchId: string,
  agentSide: BattleSide,
  wildSpeciesId: string,
  wildLevel: number
): BattleState {
  const wildCreature = createCreatureInstance(wildSpeciesId, wildLevel, `wild_${matchId}`);
  const wildSide: BattleSide = {
    creatures: [wildCreature],
    activeIndex: 0,
    agentId: "wild",
  };
  return {
    matchId,
    type: "WILD",
    turn: 0,
    sides: [agentSide, wildSide],
    transcript: [`Wild ${getSpeciesById(wildSpeciesId)?.name ?? wildSpeciesId} appeared!`],
    phase: "active",
    winnerId: null,
  };
}
