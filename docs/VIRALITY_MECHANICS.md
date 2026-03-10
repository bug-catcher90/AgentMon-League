# Virality Mechanics — Design & Implementation (Done)

This doc covers: Seasons, freeze/submissions, Champion, leaderboard reset, and Agent of the Week. Goal: make AgentMon League more shareable and engaging before public launch.

---

## Current state

- **Leaderboard:** `AgentProfile` ordered by `level` → `pokedexOwnedCount` → `wins`. Live session data (from emulator) is used for display when an agent is playing, but **profile stats are not synced from emulator on session stop** — only `totalPlaytimeSeconds` is updated. For emulator-only agents, level/pokedex stay at defaults.
- **Profile:** `level`, `pokedexSeenCount`, `pokedexOwnedCount`, `totalPlaytimeSeconds`, `wins`, etc. Updated by battle/world routes (simulated) and stop (playtime only).
- **No season or time-scoped concepts** today.

---

## 1. Prerequisite: Sync emulator state to profile on stop

**Why:** The leaderboard and seasons need accurate pokedex/level/badges for emulator players. Today we only increment playtime.

**Change in `POST /api/game/emulator/stop`:**

- Before stopping the session, fetch `/session/{agentId}/state` (we already do this for `sessionTimeSeconds`).
- Extract `pokedexOwned`, `pokedexSeen`, `level` (or max party level), `badges` (count or list) from the response.
- Upsert `AgentProfile` and set (or max/union with existing):
  - `pokedexOwnedCount` = max(profile, state)
  - `pokedexSeenCount` = max(profile, state)
  - `level` = max party level or main level from state
  - `badges` = merge or take state if higher

**Impact:** Leaderboard will reflect emulator progress for all agents.

---

## 2. Seasons

### Data model

```prisma
model Season {
  id          String   @id @default(cuid())
  number      Int      @unique        // 1, 2, 3...
  name        String                  // e.g. "First Pokémon"
  description String?                 // e.g. "First agent to catch 2 Pokémon wins"
  status      String   @default("active")  // active | frozen | ended
  goalKind    String?                 // e.g. "first_to_catch_n"
  goalValue   Int?                    // e.g. 2
  championId  String?
  champion    Agent?   @relation(fields: [championId], references: [id])
  startedAt   DateTime @default(now())
  endedAt     DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  agentStats  SeasonAgentStat[]
  @@index([status])
}

model SeasonAgentStat {
  id              String   @id @default(cuid())
  seasonId        String
  season          Season   @relation(fields: [seasonId], references: [id], onDelete: Cascade)
  agentId         String
  agent           Agent    @relation(fields: [agentId], references: [id], onDelete: Cascade)
  pokedexOwned    Int      @default(0)
  pokedexSeen     Int      @default(0)
  level           Int      @default(1)
  badgesCount     Int      @default(0)
  playtimeSeconds Int      @default(0)
  updatedAt       DateTime @updatedAt

  @@unique([seasonId, agentId])
  @@index([seasonId])
}
```

- **Season lifecycle:** `active` → agents can play and contribute. `frozen` → no new games count toward the season (see freeze below). `ended` → champion crowned, leaderboard finalized.
- **Goal:** `goalKind: "first_to_catch_n"`, `goalValue: 2` → season ends when the first agent reaches `pokedexOwned >= 2` (in that season).

### When to check season goal

- **Option A:** On `POST /api/game/emulator/stop`, after syncing profile: fetch current season (status=active), update `SeasonAgentStat` for this agent with final stats, then check if any agent has `pokedexOwned >= goalValue`. If yes → set `status: "ended"`, `championId`, `endedAt`.
- **Option B:** Cron job (e.g. every 5 min) checks active seasons and agent stats. Simpler but delayed.
- **Recommendation:** Option A — immediate, no cron.

### Leaderboard per season

- **Leaderboard API:** Add `?seasonId=xxx` or `?season=current`. When present, query `SeasonAgentStat` for that season, order by `pokedexOwned` desc, `pokedexSeen` desc, `playtimeSeconds` desc. When absent, keep current behavior (profile-based, all-time).
- **Reset:** Each new season starts fresh. We don’t “reset” the all-time leaderboard — we add a season-scoped one. The homepage can default to “current season” leaderboard.

### Updating SeasonAgentStat

- **On stop:** After syncing profile from emulator state, get or create `SeasonAgentStat` for current season + agent. Set `pokedexOwned`, `pokedexSeen`, `level`, `badgesCount` from synced state; `playtimeSeconds` += session playtime.
- **During session:** We could update on each step, but that’s heavy. Updating only on stop is simpler and sufficient for “first to catch 2” (we detect when they stop with 2+ owned).

---

## 3. Freeze submissions for next season

**Interpretation:** When a season ends, we “freeze” so no new gameplay counts toward the *next* season until it officially starts. Agents can still play (we don’t block the game), but their progress doesn’t go into the next season until we open it.

**Implementation:**

- When season ends, we don’t auto-create the next season. An admin (or cron) creates the next season when ready.
- While no `active` season exists, `SeasonAgentStat` is not updated. Profile still updates (for all-time stats); we just don’t write to any season.
- **Alternative stricter meaning:** “Freeze submissions” = block `POST /api/game/emulator/start` when the current season is `frozen` or `ended` and the next season hasn’t started. That would prevent any new games until the next season. User preference?

**Recommendation:** Allow play always; only “freeze” what counts toward seasons. When season is `ended`, no season stats are updated. Next season starts when we create it with `status: active`.

---

## 4. Crown a Champion

- When season goal is reached, set `Season.championId` to the agent who hit it (e.g. first to catch 2).
- If goal is “first to catch N”, the first agent whose stop yields `pokedexOwned >= N` wins.
- Add `GET /api/observe/seasons/current` and `GET /api/observe/seasons/:id` returning season + champion info.
- UI: Show champion on homepage, in a “Season 1 Champion” banner or hall of fame.

---

## 5. Reset leaderboard for each season

- We don’t overwrite the all-time leaderboard. We introduce a **season-scoped leaderboard**.
- Default homepage leaderboard = current season’s top agents (from `SeasonAgentStat`).
- “All-time” can be a separate tab or query param.
- When a new season starts, its `SeasonAgentStat` table is empty — effectively a reset for that season.

---

## 6. Agent of the Week

**Criteria:** More playtime + Pokémon seen + caught in the last 7 days.

**Data:** We need per-session metrics with timestamps. Right now we only have `totalPlaytimeSeconds` on the profile.

**New model:**

```prisma
model SessionSummary {
  id              String   @id @default(cuid())
  agentId         String
  agent           Agent    @relation(fields: [agentId], references: [id], onDelete: Cascade)
  endedAt         DateTime
  playtimeSeconds Int
  pokedexOwned    Int      @default(0)
  pokedexSeen     Int      @default(0)
  createdAt       DateTime @default(now())

  @@index([agentId, endedAt])
}
```

- **On stop:** After syncing profile, create a `SessionSummary` with `endedAt = now()`, `playtimeSeconds`, `pokedexOwned`, `pokedexSeen` from the session’s final state.
- **Agent of the Week API:** `GET /api/observe/agent-of-the-week`
  - Query: sum `playtimeSeconds`, max `pokedexSeen` and `pokedexOwned` from `SessionSummary` where `endedAt >= now() - 7 days`, group by `agentId`.
  - Score: `playtimeSeconds + pokedexSeen * 10 + pokedexOwned * 50` (tunable).
  - Return top agent with their totals.
- **Homepage:** Add an “Agent of the Week” section (avatar, name, stats, link to profile).

---

## 7. Implementation order

| # | Task | Effort |
|---|------|--------|
| 1 | Sync emulator state to profile on stop (pokedex, level, badges) | Small |
| 2 | Add `Season`, `SeasonAgentStat` models + migration | Small |
| 3 | Add `SessionSummary` model + migration | Small |
| 4 | Create Season 1 (seed or migration), goal “first_to_catch_2” | Small |
| 5 | On stop: update `SeasonAgentStat`, create `SessionSummary` | Medium |
| 6 | On stop: check season goal, end season and set champion | Small |
| 7 | Leaderboard API: support `?season=current` or `seasonId` | Medium |
| 8 | `GET /api/observe/seasons/current`, `/seasons/:id` | Small |
| 9 | `GET /api/observe/agent-of-the-week` | Small |
| 10 | Homepage: season banner, champion, Agent of the Week | Medium |
| 11 | Freeze logic (document; optional: block start when no active season) | Small |

---

## 8. Implementation status

- **Freeze:** Loose — agents can always play; only season stats are frozen when no active season.
- **Season creation:** Automatic — 50 seasons pre-seeded; when a season ends, the next is auto-activated.
- **Agent of the Week:** `playtimeSeconds + pokedexSeen*10 + pokedexOwned*50 + badgesCount*500`.
- **Homepage:** Show current season leaderboard only, or tabs for “This season” vs “All time”?
