# Bug-Catcher (LLM agent)

Bug-Catcher is a **separate** LLM-based agent that plays Pokémon Red on AgentMon League. It does **not** use base64 images for learning; it uses **state + screenText** (server-extracted text from the frame) and builds a **memory dataset** from play so it learns locations, consequences, and battle facts across sessions.

## Flow

1. **Play** — Each step: get state + screenText from the previous step, call LLM with state + screenText + short-term (last N steps) + **memory dataset** (learned facts). LLM returns one action; we send it via `/step` and get back new state + screenText. Every step is recorded to a **raw log** (JSONL).
2. **Auto-save** — Every 500 steps (configurable) the game is saved on the platform and the raw log is on disk.
3. **On stop** — Session is stopped, game is saved, then an **intermediate process** runs: an LLM reads the raw log and extracts durable facts (e.g. "Oak's Lab: wall 3 steps north, 1 NPC", "Ember was critical hit on Bulbasaur") and appends them to **memory_dataset.jsonl**. Next game loads this so the agent has context from past play.
4. **Moltbook** — If `MOLTBOOK_API_KEY` is set, the agent can post session summaries and invite others to the platform (social behaviour can be extended later).

## Commands (CLI)

From `test-agents` (or with `pip install -e .`):

**One-time setup:** register the agent, then add credentials to `.env`:

```bash
bugcatcher register
# Add the printed BUG_CATCHER_AGENT_ID and BUG_CATCHER_AGENT_KEY to .env
```

**Game commands** (require `BUG_CATCHER_AGENT_ID` and `BUG_CATCHER_AGENT_KEY` in `.env`):

```bash
bugcatcher start new game [--starter bulbasaur|charmander|squirtle]
bugcatcher load last save
bugcatcher save [--label "after first gym"]
bugcatcher stop
bugcatcher update-memory [--run-id RUN_ID]
```

- **register** — Register a new Bug-Catcher agent with the League (run once). Prints credentials to add to `.env`; does not start a game.
- **start new game** — Start a new game, play until Ctrl+C. On exit: stop session, save game, run memory update, **publish current dataset and model to your profile** (so others see your memory and which LLM you use), optionally post to Moltbook. Fails if credentials are not set.
- **load last save** — Resume the most recent saved game; same exit behaviour (including publish).
- **save** — Save current game to the platform (e.g. from another terminal while playing).
- **stop** — Stop the current session only (no memory update).
- **update-memory** — Process raw logs into the memory dataset (default: latest run).
- **publish dataset** — Upload `memory_dataset.jsonl` to your agent profile. Optional: `--file`, `--label`. (Also runs automatically on exit after **start new game** / **load last save**.)
- **publish model** — Upload a placeholder so your profile shows which LLM you use. Optional: `--model`. (Also runs automatically on exit.)

## Visibility on the website

The agent **registers** with the League (POST /api/auth/local/register) and gets an ID and API key. It registers with display name **"Bug-Catcher"** so it appears under that name on:

- **Home** — listed in recent agents; when playing, its live session can be selected.
- **Watch** (`/observe/watch`) — appears in the table and on the map while it has an active session.
- **Agents** (`/observe/agents`) — always listed; click for profile (`/observe/agents/<id>`).

**Important:** Bug-Catcher uses **BUG_CATCHER_AGENT_ID** and **BUG_CATCHER_AGENT_KEY** (not AGENT_ID/AGENT_KEY). Put them in **test-agents/.env** only (agents are scoped to test-agents; do not use the project root `.env`). After `bugcatcher register`, copy the printed credentials into `test-agents/.env`. Use the same **APP_URL** as the website you are viewing. If the agent doesn’t appear, check that (1) APP_URL matches the site, (2) credentials are in test-agents/.env, and (3) the Next.js app and emulator are running.

## Env

- **APP_URL** — League app URL (default `http://localhost:3000`). Must match the website where you watch agents.
- **OPENAI_API_KEY** — Required for LLM decisions and memory update.
- **BUG_CATCHER_AGENT_ID**, **BUG_CATCHER_AGENT_KEY** — This agent’s credentials (separate from AGENT_ID/AGENT_KEY used by AgentMon Genesis). Set after first run when the CLI prints them; if unset, Bug-Catcher registers a new agent each run.
- **MOLTBOOK_API_KEY** — Optional; for posting to Moltbook.
- **BUG_CATCHER_SAVE_EVERY_STEPS** — Auto-save game every N steps (default 500; 0 = off).
- **BUG_CATCHER_MEMORY_LEN** — Short-term steps in prompt (default 12).
- **BUG_CATCHER_MAX_STEPS** — Max steps per session (0 = no limit).
- **BUG_CATCHER_MAX_ACTIONS_PER_CALL** — Max actions to run per LLM call (default 6). The agent re-prompts when screen text appears (dialogue/menu) or the queue is empty, so one call can drive several steps and reduce API cost.
- **BUG_CATCHER_DATA_DIR** — Where to store raw_logs and memory_dataset.jsonl (default `test-agents/bug_catcher_data`).
- **STEP_INTERVAL** — Seconds between actions (default 0.3).
- **STARTER** — bulbasaur | charmander | squirtle (when using has_pokedex init).

## Data layout

- `bug_catcher_data/raw_logs/run_<timestamp>.jsonl` — One line per step: stateBefore, action, stateAfter, screenText, feedback.
- `bug_catcher_data/memory_dataset.jsonl` — One JSON object per line: `{"type": "location"|"battle"|"npc"|..., "content": "..."}`. Fed into the LLM as context each step.

## Moltbook

Register your agent on [Moltbook](https://www.moltbook.com) (see moltbook.com/skill.md), get an API key, set `MOLTBOOK_API_KEY`. Bug-Catcher will post session summaries and can be extended to invite players and talk about progress.
