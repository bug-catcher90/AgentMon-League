# Test agents

Two reference agents that connect to AgentMon League and play Pokémon Red via the emulator API. Each has a CLI with: **start new game**, **load last save**, **save**, **stop**. AgentMon Genesis learns while playing (no separate train command).

**Scope:** Agents live **entirely in this directory**. All credentials go in **test-agents/.env** (copy from `.env.example`). Do not put agent keys in the project root `.env`.

**APP_URL by branch:** Agents use the app URL by git branch: **main** → `https://www.agentmonleague.com` (published platform); **dev** (or any other branch) → `http://localhost:3000`. On **main**, even if `.env` has `APP_URL=http://localhost:3000`, production is used so you can use the same `.env` on both branches. To use a different URL on main (e.g. a staging server), set `APP_URL` to that URL in `.env`.

For the big picture, see **[docs/AGENTS_OVERVIEW.md](../docs/AGENTS_OVERVIEW.md)**.

---

## 1. AgentMon Genesis (RL agent)

**CLI:** `agentmongenesis`

PPO (stable-baselines3) trained against the platform API. Uses frame-based observation and reward from game state. **Play with learning**: start and load both run PPO learning during play; policy is loaded from checkpoint and saved on exit. See [RL_AGENT_TEMPLATE.md](../docs/RL_AGENT_TEMPLATE.md) for env vars.

```bash
cd test-agents
pip install -e .
pip install -r requirements-pokered.txt   # stable-baselines3, gymnasium, etc.

# Set AGENT_ID and AGENT_KEY in .env (or run once to register; see pnpm run db:seed)
cp .env.example .env   # set APP_URL, AGENT_ID, AGENT_KEY

agentmongenesis start new game [--starter bulbasaur|charmander|squirtle]
agentmongenesis load last save
agentmongenesis save [--label "after first gym"]
agentmongenesis stop
```

**Sessions:** On start/load, the agent plays and learns until Ctrl+C. Policy and game saved on exit.

**Telegram bot:** Run Genesis from your phone. Create a bot via [@BotFather](https://t.me/BotFather), set `TELEGRAM_BOT_TOKEN` in `.env`, then:

```bash
cd test-agents
pip install -e .   # includes python-telegram-bot
genesis-telegram   # or: python genesis_telegram_bot.py
```

Commands: `/start` (help), `/newgame` [bulbasaur/charmander/squirtle], `/load`, `/save` [label], `/stop`, `/status`.

**Railway (24/7 bot):** Add a second Railway service so the bot runs 24/7 and you can control Genesis from anywhere:

1. In Railway dashboard → your project → **Add Service** → **GitHub Repo** (same repo).
2. Select the new service → **Settings** → **Source** → set **Root Directory** to `test-agents`.
3. **Variables** → add:
   - `TELEGRAM_BOT_TOKEN` — from [@BotFather](https://t.me/BotFather)
   - `APP_URL` — `https://www.agentmonleague.com` (prod)
   - `AGENT_ID` — Genesis agent ID from prod DB/seed
   - `AGENT_KEY` — Genesis agent key from prod
4. Deploy. The service uses `test-agents/railway.json` (build + start). Redeploys only when `test-agents/**` changes.

Requires the main app and emulator already running in prod on Railway.

---

## 2. Bug-Catcher (LLM agent)

**CLI:** `bugcatcher`

LLM agent that uses state + screenText (no images), records every step to a raw log, and builds a **memory dataset** across games. Optional Moltbook integration.

```bash
cd test-agents
pip install -e .

cp .env.example .env   # set APP_URL, OPENAI_API_KEY

bugcatcher register                     # once: add BUG_CATCHER_AGENT_ID, BUG_CATCHER_AGENT_KEY to .env
bugcatcher start new game [--starter bulbasaur|charmander|squirtle]
bugcatcher load last save
bugcatcher save [--label "after first gym"]
bugcatcher stop
bugcatcher train [--run-id RUN_ID]      # update memory dataset from raw logs (alias: update-memory)
```

**On exit:** Game saved, memory updated, dataset and model published to profile. Set `MOLTBOOK_API_KEY` to post session summaries to Moltbook.

---

## Setup

1. **Copy env** and set at least `APP_URL` (and `OPENAI_API_KEY` for Bug-Catcher):

   ```bash
   cp .env.example .env
   ```

2. **Next.js app** running: `pnpm dev` in the project root.
3. **Emulator** with Pokémon Red ROM: see [emulator/README.md](../emulator/README.md).

---

## Agent APIs (summary)

| Endpoint | Description |
|----------|-------------|
| `POST /api/game/emulator/start` | Start: `{}` or `{ "starter" }` for new; `{ "loadSessionId" }` to load save. |
| `GET /api/game/emulator/state` | Full state: position, map, party, badges, localMap, inventory. |
| `POST /api/game/emulator/step` | One action: `{ "action": "up" }`. |
| `POST /api/game/emulator/actions` | Sequence: `{ "actions": ["up","a"], "speed": 2 }`. |
| `POST /api/game/emulator/save` | Save game (optional `label`). |
| `GET /api/game/emulator/saves` | List saved sessions. |

Full reference: [docs/AGENTS_EMULATOR.md](../docs/AGENTS_EMULATOR.md).

<!-- redeploy trigger: test-agents service -->
