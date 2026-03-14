# RL Agent (AgentMon Genesis) — Code Review

**Reviewed:** Observation/reward pipeline, PPO integration, API usage, and training flow.

---

## 1. Baseline & PPO integration ✅

- **Play-with-learning:** `run_play_with_learning()` in `play_loop.py` correctly:
  - Builds a `DummyVecEnv` of `EmulatorEnv` (one episode = one game session).
  - Loads the latest checkpoint via `load_latest_path()` or creates a new PPO with sensible defaults (MultiInputPolicy, n_steps=128, batch_size=64, n_epochs=3, lr=3e-4).
  - Calls `model.learn(total_timesteps=..., callback=callback)` so the policy is updated during play.
  - Uses `_PlayLearnCallback` to save checkpoints every `SAVE_EVERY_STEPS`, auto-save the game every `PLAY_SAVE_EVERY_STEPS`, and respect Ctrl+C (`_play_learn_stop_requested`).
- **On exit:** Saves the policy to `poke_{steps}_steps.zip`, saves the game to the platform, stops the session, and logs the run to `play_runs.jsonl`.
- **Checkpoints:** `checkpoints.py` provides `get_load_path(prefer_best=True)`, `load_latest_path()`, `save_model()`, and `log_play_run()`. Training “sections” (play runs) are incorporated by loading the latest/best checkpoint at start and saving new checkpoints during and after play.

**Verdict:** The baseline is solid; PPO and training-from-sessions are correctly wired.

---

## 2. Screenshots (frames) ✅

- **Source:** Frames come from the platform:
  - `get_frame(agent_id)` → `GET /api/observe/emulator/frame?agentId=...` → emulator PNG.
  - When using `run_action()` (POST `/api/game/emulator/actions`), the response can include `frameBase64`; `env.step()` uses it when present and only falls back to `get_frame()` when missing (saving a round-trip).
- **Processing in `build_obs_from_frame_and_state()`:**
  - Decode PNG with PIL, convert to grayscale, resize to 80×72 (width×height), shape (72, 80, 1).
  - Stack with previous frames: `recent_screens` is (72, 80, 3) with channels = [current, previous, older]; updated via roll and assign. Matches `OUTPUT_SHAPE` and the observation space.
- **Session agent id:** After `start_session()`, the env uses `_session_agent_id` from the response for `get_frame()` so the correct session is used even if the DB agent id differs.

**Verdict:** Screenshots are correctly fetched, decoded, resized, and fed into the observation.

---

## 3. State (game state) ✅

- **Source:** `get_state(agent_key)` → `GET /api/game/emulator/state` (proxied to emulator `/session/{id}/state`).  
  After a step, `run_action()` returns `result["state"]` (emulator returns full state after the action sequence).
- **Fields used by the RL agent:**
  - **Observation:** `partySize`, `levels`, `badges`, `eventFlags`, `explorationMap`. All are provided by the emulator (`game_state.get_game_state()` and `/session/.../actions` / `/session/.../state`). Event-flag range (0xD747–0xD87E) and exploration grid (48×48) match `obs_reward` constants.
  - **Reward:** `compute_reward()` uses `state_before` and `state_after` with `badges`, `partySize`, `pokedexOwned`, `pokedexSeen`, `mapId`, and exploration (via `explorationMap` and optional `mapId` change). Emulator state uses the same key names.
- **Robustness:** Small guard added in `obs_reward` for `badges` and `levels` (int conversion / fallbacks) so odd API responses don’t crash the agent.

**Verdict:** State is correctly obtained and used for both observations and rewards.

---

## 4. Actions ✅

- **Action space:** `V2_ACTION_NAMES = ["down", "left", "right", "up", "a", "b", "start"]` (7 actions, PokemonRedExperiments v2 style). `action_space = Discrete(7)`.
- **Execution:** `run_action(agent_key, action_name)` → `POST /api/game/emulator/actions` with `{"actions": [action_name]}`. Platform and emulator accept these names; the RL agent does not use "select" or "pass".
- **Env.step:** Converts action index to name, calls `run_action()`, then builds next observation from `result["state"]` and optional `result["frameBase64"]`, and computes reward from `state_before` and `state_after`.

**Verdict:** Actions are correctly mapped and sent; the RL model’s outputs are used for rewards and future training via `model.learn()`.

---

## 5. Rewards and future training ✅

- **Reward:** `compute_reward(state_before, state_after, step_penalty=True)`:
  - Delta of `state_progress()` (badges, partySize, pokedexOwned, pokedexSeen, mapId) with configurable weights.
  - Optional exploration: per new explored tile and/or per new map id.
  - Step penalty (configurable).
- **Training:** PPO gets `(obs, reward, terminated, truncated, info)` from `EmulatorEnv.step()`. `model.learn()` updates the policy; checkpoints and game saves persist progress so the next run continues from the last policy and game state.

**Verdict:** Rewards are consistent with the platform state; training from play sessions is correctly incorporated.

---

## 6. Text (screenText) — by design not used

- The platform can return `screenText` (e.g. from the step endpoint via OCR). The RL agent does **not** use it: observations are **frame + state** only (vision + structured state).
- This matches the documented design (“frame-based observation and reward from game state”). To use text later, you’d extend the observation (e.g. a text embedding) and the policy input.

---

## 7. Summary

| Area              | Status | Notes |
|-------------------|--------|--------|
| PPO / baseline    | ✅     | Learn loop, callbacks, checkpoint save/load. |
| Screenshots       | ✅     | Frame from API or `frameBase64`, 80×72×3 history. |
| State             | ✅     | State from API; obs and reward use correct keys. |
| Actions           | ✅     | 7 actions sent via `/api/game/emulator/actions`. |
| Rewards           | ✅     | Progress + exploration + step penalty. |
| Training from play| ✅     | Checkpoints and game saves; next run loads latest. |
| Text              | ➖     | Not used (by design). |

**Conclusion:** The RL agent correctly gets screenshots and state, sends actions, computes rewards, and connects them to the PPO model so that training from play sessions is incorporated. One small robustness change was made in `obs_reward.py` for `badges` and `levels` (safe int handling).
