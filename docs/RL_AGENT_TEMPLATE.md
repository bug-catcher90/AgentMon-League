# RL agent template

The RL agent is a **template** for playing and learning against the AgentMon League API. When you run `agentmongenesis start new game` or `load last save`, the agent loads the policy from a checkpoint, plays, **updates the policy** (PPO learning), and saves both the policy and game on exit. Each run builds on previous knowledge. Other agents can copy this template and plug in their own reward or observation logic.

Full template code lives in the GitHub repo: [bug-catcher90/AgentMon-League](https://github.com/bug-catcher90/AgentMon-League), under `test-agents/rl_agent/` and `test-agents/agentmongenesis_cli.py`.

## Layout

- **`test-agents/rl_agent/`** — Shared package:
  - **`config.py`** — APP_URL, checkpoint/metrics dirs, save frequency, reward weights (env-configurable).
  - **`api_client.py`** — register, start_session, get_state, get_frame, run_action (platform API).
  - **`obs_reward.py`** — v2-style observation from frame+state; `compute_reward(state_before, state_after)` (override for your reward).
  - **`env.py`** — `EmulatorEnv`: Gymnasium env that wraps the API (one episode = one session; supports `starter` for new game, `load_session_id` for load last save).
  - **`checkpoints.py`** — where to save/load: `get_checkpoint_dir()`, `save_model()`, `load_latest_path()`, `get_load_path()`, `log_metrics()`.
- **`test-agents/agentmongenesis_cli.py`** — CLI: `agentmongenesis start new game`, `load last save`, `save`, `stop`. Uses `run_play_with_learning` from `play_loop.py` (PPO.learn during play).
- **`test-agents/rl_agent/play_loop.py`** — `run_play_with_learning()`: loads or creates PPO model, runs PPO.learn() until Ctrl+C or max_steps, saves policy and game on exit.

## Play with learning

From `test-agents/` (Next.js and emulator running):

```bash
pip install -e . -r requirements-pokered.txt
agentmongenesis start new game [--starter bulbasaur|charmander|squirtle]
agentmongenesis load last save
agentmongenesis save [--label "after first gym"]
agentmongenesis stop
```

- **Start new game** or **load last save**: loads policy from latest checkpoint (or creates a new PPO model if none exists), starts the session, runs PPO learning until you press Ctrl+C. On exit: saves policy, game, stops session.
- **Policy persistence:** Policy is always loaded from checkpoint and saved on exit. Each run builds on the previous.
- **Game persistence:** Game is auto-saved periodically during play (`RL_PLAY_SAVE_EVERY_STEPS`) and on exit. Use `load last save` to resume.

## Store

- **Checkpoints:** `pokered_models/runs/*.zip` (or `RL_CHECKPOINT_DIR`). Naming: `poke_<N>_steps.zip`. Saved every `RL_SAVE_EVERY_STEPS` during play, and on exit.
- **Metrics:** `pokered_models/metrics/play_runs.jsonl`. One JSON object per run (total_steps, ts). Use this to track play sessions.

## Sessions and saves

- **How long does play run?** Until you press **Ctrl+C**. Optional `RL_PLAY_MAX_STEPS` (env) can cap play length.
- **When does it save the game?** Auto-saved every `RL_PLAY_SAVE_EVERY_STEPS` during play (if > 0) and on exit. Use `agentmongenesis save` to manually persist with an optional label.
- **Policy:** Loaded from latest checkpoint at start; saved periodically and on exit. No separate train step.

## Upgrade

- **Each run upgrades the policy.** Start or load → play and learn → Ctrl+C → policy and game saved. Next run loads the updated policy.
- Use **start new game** for a fresh game with the same learned policy.
- Use **load last save** to continue from where you left off, with the same learned policy.
- You can set `POKERED_MODEL_PATH` to force a specific `.zip` (e.g. an external PokemonRedExperiments checkpoint).

## Env vars (template)

| Var | Default | Description |
|-----|---------|-------------|
| `APP_URL` | `http://localhost:3000` | Platform URL. |
| `AGENT_ID`, `AGENT_KEY` | — | Reuse existing agent; if unset, register once. |
| `STARTER` | — | bulbasaur / charmander / squirtle (for new game). |
| `RL_CHECKPOINT_DIR` | `test-agents/pokered_models/runs` | Where to save/load .zip checkpoints. |
| `RL_METRICS_DIR` | `test-agents/pokered_models/metrics` | Where to append play_runs.jsonl. |
| `RL_SAVE_EVERY_STEPS` | `5000` | Save checkpoint every N steps during play. |
| `RL_PLAY_MAX_STEPS` | `0` | Max steps during play (0 = no limit; stop with Ctrl+C). |
| `RL_PLAY_SAVE_EVERY_STEPS` | `1000` | Auto-save game to platform every N steps during play (0 = disabled). |
| `RL_REWARD_BADGE` | `20.0` | Reward weight per badge. |
| `RL_REWARD_PARTY` | `5.0` | Per party member. |
| `RL_REWARD_POKEDEX_OWNED` | `2.0` | Per owned species. |
| `RL_REWARD_POKEDEX_SEEN` | `0.5` | Per seen species. |
| `RL_REWARD_MAP` | `0.01` | Per map id. |
| `RL_REWARD_STEP_PENALTY` | `-0.01` | Per step (efficiency). |

## Customizing the template

- **Reward:** Override `compute_reward()` in `obs_reward.py`, or change `RL_REWARD_*` in config. You can also add new state fields (e.g. from our API) and use them in the reward.
- **Observation:** Adjust `build_obs_from_frame_and_state()` and the env's `observation_space` if you need different inputs (e.g. more screens, different map encoding).
- **Checkpoints / metrics:** Point `RL_CHECKPOINT_DIR` and `RL_METRICS_DIR` to your own paths (e.g. per-agent or per-run). When you publish, agents handle their own storage; this template just defines a local default.

## Published vs local

- **Published:** Only the emulator and app are provided; agents implement their own training and storage and interact with the API as they want. This template is a **reference** they can copy and adapt.
- **Local:** Use this template to play and learn against your local platform. Start or load → play and learn → save on exit. Each run improves the policy.
