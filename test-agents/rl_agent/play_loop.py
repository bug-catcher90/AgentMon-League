"""Reusable play loop: load model, get obs, predict, step. Play-with-learning: PPO.learn during play."""

import os
import signal
import sys
import time
from pathlib import Path

import numpy as np
from gymnasium import Env, spaces
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback
from stable_baselines3.common.vec_env import DummyVecEnv

from rl_agent.api_client import (
    get_frame,
    get_state,
    run_action_with_auto_restart,
    save_session,
    stop_session,
)
from rl_agent.checkpoints import get_checkpoint_dir, get_load_path, load_latest_path, log_play_run, save_model
from rl_agent.env import EmulatorEnv
from rl_agent.obs_reward import (
    COORDS_PAD,
    ENC_FREQS,
    EVENT_FLAGS_END,
    EVENT_FLAGS_START,
    OUTPUT_SHAPE,
    V2_ACTION_NAMES,
    build_obs_from_frame_and_state,
    compute_reward,
)


def find_model_path(explicit_path: str | None = None) -> str:
    if explicit_path and Path(explicit_path).is_file():
        return explicit_path
    return get_load_path(prefer_best=True) or ""


# Ctrl+C flag for run_play_with_learning
_play_learn_stop_requested = False


def _play_learn_sigint_handler(_signum, _frame):
    global _play_learn_stop_requested
    _play_learn_stop_requested = True


class _PlayLearnCallback(BaseCallback):
    """Saves checkpoints, game, and responds to Ctrl+C."""

    def __init__(self, agent_key: str, save_every: int, save_game_every: int, checkpoint_dir: Path, verbose=0):
        super().__init__(verbose)
        self.agent_key = agent_key
        self.save_every = save_every
        self.save_game_every = save_game_every
        self.checkpoint_dir = checkpoint_dir
        self.last_save_game_step = 0

    def _on_step(self) -> bool:
        global _play_learn_stop_requested
        if _play_learn_stop_requested:
            return False
        n = self.num_timesteps
        # Save checkpoint periodically
        if self.save_every > 0 and n > 0 and n % self.save_every == 0:
            path = self.checkpoint_dir / f"poke_{n}_steps.zip"
            save_model(self.model, path)
            if self.verbose:
                print(f"  Checkpoint: {path}")
        # Save game periodically
        if self.save_game_every > 0 and n > self.last_save_game_step + self.save_game_every:
            try:
                save_session(self.agent_key, label=f"auto_step_{n}")
                self.last_save_game_step = n
                if self.verbose:
                    print(f"  Game saved at step {n}.")
            except Exception as e:
                if self.verbose:
                    print(f"  Game save at {n} failed: {e}", file=sys.stderr)
        return True


def run_play_with_learning(
    agent_id: str,
    agent_key: str,
    *,
    starter: str | None = None,
    load_session_id: str | None = None,
    max_steps: int = 0,
) -> int:
    """
    Play with PPO learning. Loads policy from checkpoint (or creates new), plays and updates policy
    until Ctrl+C or max_steps. On exit: saves policy, game, stops session.
    """
    global _play_learn_stop_requested
    _play_learn_stop_requested = False
    signal.signal(signal.SIGINT, _play_learn_sigint_handler)

    from rl_agent.config import (
        PLAY_SAVE_EVERY_STEPS,
        SAVE_EVERY_STEPS,
    )

    checkpoint_dir = get_checkpoint_dir()
    env = DummyVecEnv([
        lambda: EmulatorEnv(
            agent_id,
            agent_key,
            starter=starter,
            load_session_id=load_session_id,
            episode_max_steps=10_000_000,  # no truncation; user stops with Ctrl+C
        )
    ])
    load_path = load_latest_path()
    model = None
    if load_path:
        try:
            # When loading an existing checkpoint, keep PPO hyperparameters stored in the model.
            model = PPO.load(load_path, env=env, custom_objects={"lr_schedule": 0, "clip_range": 0})
        except ValueError as e:
            if "Observation spaces do not match" in str(e) or "observation_space" in str(e).lower():
                print("Checkpoint from older version (different observation space); starting with a new policy.")
                model = None
            else:
                raise
    if model is None:
        # New PPO model tuned for long‑horizon, sparse-ish rewards of Pokémon Red.
        model = PPO(
            "MultiInputPolicy",
            env,
            verbose=1,
            n_steps=2048,
            batch_size=256,
            n_epochs=10,
            learning_rate=3e-4,
            gamma=0.999,
            gae_lambda=0.95,
            clip_range=0.1,
            ent_coef=0.01,
        )

    callback = _PlayLearnCallback(
        agent_key=agent_key,
        save_every=SAVE_EVERY_STEPS,
        save_game_every=PLAY_SAVE_EVERY_STEPS if PLAY_SAVE_EVERY_STEPS > 0 else 0,
        checkpoint_dir=checkpoint_dir,
        verbose=1,
    )
    total = max_steps if max_steps > 0 else 10_000_000
    try:
        model.learn(total_timesteps=total, callback=callback, progress_bar=False)
    except KeyboardInterrupt:
        pass
    finally:
        signal.signal(signal.SIGINT, signal.SIG_DFL)

    step_index = getattr(model, "num_timesteps", 0) or 0
    env.close()

    # Save policy
    final_path = checkpoint_dir / f"poke_{step_index}_steps.zip"
    save_model(model, final_path)
    print(f"Policy saved to {final_path}")

    # Save game
    if agent_key and step_index > 0:
        try:
            save_session(agent_key, label=f"exit_{step_index}_steps")
            print("Game saved to platform (use 'load last save' to resume).")
        except Exception as e:
            print(f"Save on exit: {e}", file=sys.stderr)

    # Stop session
    try:
        stop_session(agent_key)
        print("Session stopped and playtime recorded.")
    except Exception as e:
        print(f"Stop session: {e}", file=sys.stderr)

    if step_index > 0:
        try:
            log_play_run(step_index)
            print(f"Run logged ({step_index} steps).")
        except Exception as e:
            print(f"Log run: {e}", file=sys.stderr)

    return step_index


def run_play_loop(
    agent_id: str,
    agent_key: str,
    model_path: str,
    *,
    starter: str | None = None,
    step_interval: float | None = None,
    on_exit_stop: bool = True,
    on_exit_log_run: bool = True,
    max_steps: int = 0,
) -> int:
    """
    Run the RL play loop until KeyboardInterrupt or max_steps (if > 0). Returns total steps.
    If on_exit_stop, calls stop_session(agent_key) on exit.
    If on_exit_log_run, appends this run to play_runs.jsonl.
    """
    from rl_agent.config import PLAY_SAVE_EVERY_STEPS
    save_every_steps = PLAY_SAVE_EVERY_STEPS

    interval = (
        step_interval
        if step_interval is not None
        else float(os.environ.get("STEP_INTERVAL", "0.1"))
    )
    dummy = _make_dummy_env()
    model = PPO.load(model_path, env=dummy, custom_objects={"lr_schedule": 0, "clip_range": 0})

    recent_screens = np.zeros(OUTPUT_SHAPE, dtype=np.uint8)
    recent_actions = np.zeros(3, dtype=np.int8)
    step_index = 0
    state_before: dict = {}

    def _fetch_frame_with_retry(aid: str, attempts: int = 6, delay_s: float = 0.3) -> bytes:
        last_err: Exception | None = None
        for _ in range(max(1, attempts)):
            try:
                return get_frame(aid)
            except Exception as e:
                last_err = e
                time.sleep(delay_s)
        raise RuntimeError(f"Could not fetch frame for agent {aid}") from last_err

    try:
        while True:
            try:
                frame_bytes = _fetch_frame_with_retry(agent_id)
                state = get_state(agent_key) or {}
            except Exception as e:
                print(f"Frame/state error: {e}", file=sys.stderr)
                time.sleep(2)
                continue

            obs = build_obs_from_frame_and_state(
                frame_bytes, state, recent_screens, recent_actions
            )
            recent_screens = obs["screens"].copy()

            action_idx, _ = model.predict(obs, deterministic=False)
            action_idx = int(action_idx)
            if action_idx < 0 or action_idx >= len(V2_ACTION_NAMES):
                action_idx = 0
            action_name = V2_ACTION_NAMES[action_idx]
            recent_actions = np.roll(recent_actions, 1)
            recent_actions[0] = action_idx

            try:
                result = run_action_with_auto_restart(agent_key, action_name, starter=starter)
                _state = result.get("state") or {}
                if result.get("_session_restarted"):
                    # Reset visual/action history so the next obs isn't contaminated
                    # by frames from the pre-restart session.
                    recent_screens = np.zeros(OUTPUT_SHAPE, dtype=np.uint8)
                    recent_actions = np.zeros(3, dtype=np.int8)
                    recent_actions[0] = action_idx
                    restarted_agent_id = result.get("_restarted_agent_id")
                    if restarted_agent_id:
                        agent_id = str(restarted_agent_id)
            except Exception as e:
                print(f"Step error: {e}", file=sys.stderr)
                time.sleep(2)
                continue

            state_before = _state
            step_index += 1
            if step_index % 20 == 0:
                loc = _state.get("mapName", "?")
                print(f"  Steps: {step_index} | {loc} | last: {action_name}")
            if save_every_steps > 0 and step_index % save_every_steps == 0:
                try:
                    save_session(agent_key, label=f"auto_step_{step_index}")
                    print(f"  Game saved at step {step_index} (you can 'load last save' to resume).")
                except Exception as e:
                    print(f"  Auto-save at step {step_index} failed: {e}", file=sys.stderr)
            if max_steps > 0 and step_index >= max_steps:
                print(f"Reached max steps ({max_steps}). Stopping.")
                break
            time.sleep(interval)
    except KeyboardInterrupt:
        pass
    finally:
        # Save game to platform before stopping so "load last save" works
        if agent_key and step_index > 0:
            try:
                save_session(agent_key, label=f"exit_{step_index}_steps")
                print("Game saved to platform (use 'load last save' to resume).")
            except Exception as e:
                print(f"Save on exit: {e}", file=sys.stderr)
        if on_exit_stop and agent_key:
            try:
                stop_session(agent_key)
                print("Session stopped and playtime recorded.")
            except Exception as e:
                print(f"Stop session: {e}", file=sys.stderr)
        if on_exit_log_run and step_index > 0:
            try:
                log_play_run(step_index)
                print(f"Run logged ({step_index} steps).")
            except Exception as e:
                print(f"Log run: {e}", file=sys.stderr)
    return step_index


class _DummyEnv(Env):
    observation_space = spaces.Dict({
        "screens": spaces.Box(low=0, high=255, shape=OUTPUT_SHAPE, dtype=np.uint8),
        "health": spaces.Box(low=0, high=1, shape=(1,)),
        "level": spaces.Box(low=-1, high=1, shape=(ENC_FREQS,)),
        "badges": spaces.MultiBinary(8),
        "events": spaces.MultiBinary((EVENT_FLAGS_END - EVENT_FLAGS_START) * 8),
        "map": spaces.Box(low=0, high=255, shape=(COORDS_PAD * 4, COORDS_PAD * 4, 1), dtype=np.uint8),
        "mapId": spaces.Box(low=0.0, high=1.0, shape=(1,), dtype=np.float32),
        "recent_actions": spaces.MultiDiscrete([len(V2_ACTION_NAMES)] * 3),
    })
    action_space = spaces.Discrete(len(V2_ACTION_NAMES))

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        return {
            "screens": np.zeros(OUTPUT_SHAPE, dtype=np.uint8),
            "health": np.array([1.0], dtype=np.float32),
            "level": np.zeros(ENC_FREQS, dtype=np.float32),
            "badges": np.zeros(8, dtype=np.int8),
            "events": np.zeros((EVENT_FLAGS_END - EVENT_FLAGS_START) * 8, dtype=np.int8),
            "map": np.zeros((COORDS_PAD * 4, COORDS_PAD * 4, 1), dtype=np.uint8),
            "mapId": np.array([0.0], dtype=np.float32),
            "recent_actions": np.zeros(3, dtype=np.int8),
        }, {}

    def step(self, action):
        return self.reset()[0], 0.0, False, False, {}


def _make_dummy_env() -> _DummyEnv:
    return _DummyEnv()
