# RL agent template

The RL agent is a **template** for training and playing against the AgentMon League API. It trains by interacting with the emulator (get frame/state → choose action → step → reward from state), saves checkpoints and metrics locally, and supports **upgrading** by loading the best or latest model when playing. Other agents can copy this template and plug in their own reward or observation logic.

## Layout

- **`test-agents/rl_agent/`** — Shared package:
  - **`config.py`** — APP_URL, checkpoint/metrics dirs, save frequency, reward weights (env-configurable).
  - **`api_client.py`** — register, start_session, get_state, get_frame, run_action (platform API).
  - **`obs_reward.py`** — v2-style observation from frame+state; `compute_reward(state_before, state_after)` (override for your reward).
  - **`env.py`** — `EmulatorEnv`: Gymnasium env that wraps the API (one episode = one session).
  - **`checkpoints.py`** — where to save/load: `get_checkpoint_dir()`, `save_model()`, `load_latest_path()`, `load_best_path()`, `get_load_path()`, `log_metrics()`.
- **`test-agents/train_rl_agent.py`** — Train: register, create env, PPO.learn(), save checkpoints and (optionally) best model; log metrics per episode.
- **`test-agents/play_with_pokered_model.py`** — Play: load model from template dir (best or latest) or from `POKERED_MODEL_PATH`, then loop get frame/state → predict → step.

## Train

From `test-agents/` (Next.js and emulator running):

```bash
pip install -r requirements.txt -r requirements-pokered.txt
python train_rl_agent.py
```

- Registers an agent (or uses `AGENT_ID`/`AGENT_KEY`), then runs PPO training.
- Each **episode** = one game session: reset() starts a new session, steps until `EPISODE_MAX_STEPS` or done.
- **Reward** is computed from state deltas (badges, party, pokedex, map id). Tune via `RL_REWARD_*` env vars (see `rl_agent/config.py`).
- Saves checkpoints every `RL_SAVE_EVERY_STEPS` to `RL_CHECKPOINT_DIR` (default: `test-agents/pokered_models/runs/`) as `poke_<steps>_steps.zip`.
- If `RL_SAVE_BEST=1`, saves `best_model.zip` whenever episode reward improves.
- Appends one line per episode to `RL_METRICS_DIR/metrics.jsonl` (episode, total_steps, episode_reward, episode_len) for upgrade tracking.

## Store

- **Checkpoints:** `pokered_models/runs/*.zip` (or `RL_CHECKPOINT_DIR`). Naming: `poke_<N>_steps.zip`, plus `best_model.zip` if you trained with `RL_SAVE_BEST=1`.
- **Metrics:** `pokered_models/metrics/metrics.jsonl` (or `RL_METRICS_DIR`). One JSON object per line (episode, total_steps, episode_reward, episode_len). Use this to compare runs and see improvement over time.

## Sessions and saves

- **How long does play run?** When you run `agentmongenesis start new game` or `load last save`, the agent plays until **you press Ctrl+C**. Optional `RL_PLAY_MAX_STEPS` (env) can cap play length.
- **When does it save the game?** By default play does **not** auto-save the game state to the platform. On Ctrl+C it: calls **stop session** (playtime recorded), appends to **`play_runs.jsonl`**, and does **not** call the save-game API — so you can't resume that exact state via "load last save" unless you saved earlier. Use **`agentmongenesis save`** (see CLI) to persist the current game.
- **Training episodes:** Each episode = one **new** game: the env calls `stop_session()` then `start_session()` on every `reset()`, capped at **`RL_EPISODE_MAX_STEPS`** (default 2000) steps.

## How the agent improves

- **Training** (`train_rl_agent.py`): Resumes from the **latest checkpoint** (by mtime) if one exists. Each run continues from the last; checkpoints every `RL_SAVE_EVERY_STEPS` and optionally **best_model.zip** when episode reward improves.
- **Play → record → update:** Set **`RECORD_PLAY_TRAJECTORIES=1`** when playing (e.g. `RECORD_PLAY_TRAJECTORIES=1 agentmongenesis start new game`). On stop, the run is logged to **`play_runs.jsonl`** and **(obs, action, reward)** are saved to **`pokered_models/trajectories/run_<ts>.npz`**. Run **`agentmongenesis train from play`** to update the policy from those trajectories (behavioral cloning). The command loads the latest checkpoint, runs a few BC epochs on the recorded data, and saves **`after_play_bc.zip`** (and optionally **best_model.zip** if `RL_TRAIN_FROM_PLAY_SAVE=1`). The next play or train then uses the updated model. So: play → stop → **agentmongenesis train from play** → play again with a policy that has incorporated the play data.

## Upgrade

- **Play** uses the template by default: `python play_with_pokered_model.py` loads **best** model if present, else **latest** (by mtime) from the checkpoint dir.
- To “upgrade”: run more training (`python train_rl_agent.py`). New checkpoints and (if better) a new `best_model.zip` are written; the next play run will use the upgraded model.
- You can also set `POKERED_MODEL_PATH` to a specific `.zip` to force that file (e.g. an external PokemonRedExperiments checkpoint).

## Env vars (template)

| Var | Default | Description |
|-----|---------|-------------|
| `APP_URL` | `http://localhost:3000` | Platform URL. |
| `AGENT_ID`, `AGENT_KEY` | — | Reuse existing agent; if unset, register once. |
| `STARTER` | — | bulbasaur / charmander / squirtle (when using has_pokedex init state). |
| `RL_CHECKPOINT_DIR` | `test-agents/pokered_models/runs` | Where to save/load .zip checkpoints. |
| `RL_METRICS_DIR` | `test-agents/pokered_models/metrics` | Where to append metrics.jsonl. |
| `RL_SAVE_EVERY_STEPS` | `5000` | Save checkpoint every N steps. |
| `RL_SAVE_BEST` | `1` | Save best_model.zip when episode reward improves. |
| `RL_TRAIN_TOTAL_STEPS` | `50000` | Total training steps. |
| `RL_EPISODE_MAX_STEPS` | `2000` | Max steps per episode (session). |
| `RL_PLAY_MAX_STEPS` | `0` | Max steps during play (0 = no limit; stop with Ctrl+C). |
| `RL_PLAY_SAVE_EVERY_STEPS` | `1000` | Auto-save game to platform every N steps during play (0 = disabled). Lets you resume with "load last save" even after Ctrl+C. |
| `RECORD_PLAY_TRAJECTORIES` | `0` | If 1, record (obs, action, reward) during play for `train_from_play.py`. |
| `RL_TRAJECTORIES_DIR` | `pokered_models/trajectories` | Where play trajectories are saved. |
| `RL_BC_EPOCHS` | `3` | Epochs when running `train_from_play.py` (behavioral cloning). |
| `RL_BC_BATCH_SIZE` | `64` | Minibatch size for BC. |
| `RL_BC_LR` | `1e-4` | Learning rate for BC. |
| `RL_TRAIN_FROM_PLAY_SAVE` | `0` | If 1, save updated model as best_model.zip after train_from_play. |
| `RL_REWARD_BADGE` | `20.0` | Reward weight per badge. |
| `RL_REWARD_PARTY` | `5.0` | Per party member. |
| `RL_REWARD_POKEDEX_OWNED` | `2.0` | Per owned species. |
| `RL_REWARD_POKEDEX_SEEN` | `0.5` | Per seen species. |
| `RL_REWARD_MAP` | `0.01` | Per map id. |
| `RL_REWARD_STEP_PENALTY` | `-0.01` | Per step (efficiency). |

## Customizing the template

- **Reward:** Override `compute_reward()` in `obs_reward.py`, or change `RL_REWARD_*` in config. You can also add new state fields (e.g. from our API) and use them in `state_progress()`.
- **Observation:** Adjust `build_obs_from_frame_and_state()` and the env’s `observation_space` if you need different inputs (e.g. more screens, different map encoding).
- **Checkpoints / metrics:** Point `RL_CHECKPOINT_DIR` and `RL_METRICS_DIR` to your own paths (e.g. per-agent or per-run). When you publish, agents handle their own storage; this template just defines a local default.

## Published vs local

- **Published:** Only the emulator and app are provided; agents implement their own training and storage and interact with the API as they want. This template is a **reference** they can copy and adapt.
- **Local:** Use this template to train and play so you have functional agents for testing. Train → store → upgrade → play, all against your local platform.
