"""Reusable play loop: load model, get obs, predict, step. On exit: stop session and log run."""

import os
import sys
import time
from pathlib import Path

import numpy as np
from gymnasium import Env, spaces
from stable_baselines3 import PPO

from rl_agent.api_client import get_frame, get_state, run_action, save_session, stop_session
from rl_agent.checkpoints import get_load_path, log_play_run, save_play_trajectory
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


def run_play_loop(
    agent_id: str,
    agent_key: str,
    model_path: str,
    *,
    step_interval: float | None = None,
    on_exit_stop: bool = True,
    on_exit_log_run: bool = True,
    max_steps: int = 0,
    record_trajectories: bool = False,
) -> int:
    """
    Run the RL play loop until KeyboardInterrupt or max_steps (if > 0). Returns total steps.
    If on_exit_stop, calls stop_session(agent_key) on exit.
    If on_exit_log_run, appends this run to play_runs.jsonl for later training.
    If record_trajectories, saves (obs, action, reward) to TRAJECTORIES_DIR for train_from_play.
    """
    from rl_agent.config import PLAY_SAVE_EVERY_STEPS, RECORD_PLAY_TRAJECTORIES
    record = record_trajectories or RECORD_PLAY_TRAJECTORIES
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
    obs_list: list = []
    actions_list: list = []
    rewards_list: list = []

    try:
        while True:
            try:
                frame_bytes = get_frame(agent_id)
                state = get_state(agent_key) or {}
            except Exception as e:
                print(f"Frame/state error: {e}", file=sys.stderr)
                time.sleep(2)
                continue

            obs = build_obs_from_frame_and_state(
                frame_bytes, state, recent_screens, recent_actions
            )
            recent_screens = obs["screens"].copy()

            if record:
                obs_list.append({k: v.copy() if hasattr(v, "copy") else v for k, v in obs.items()})

            action_idx, _ = model.predict(obs, deterministic=False)
            action_idx = int(action_idx)
            if action_idx < 0 or action_idx >= len(V2_ACTION_NAMES):
                action_idx = 0
            action_name = V2_ACTION_NAMES[action_idx]
            recent_actions = np.roll(recent_actions, 1)
            recent_actions[0] = action_idx

            try:
                result = run_action(agent_key, action_name)
                _state = result.get("state") or {}
            except Exception as e:
                print(f"Step error: {e}", file=sys.stderr)
                time.sleep(2)
                continue

            reward = float(compute_reward(state_before, _state, step_penalty=True))
            state_before = _state

            if record:
                actions_list.append(action_idx)
                rewards_list.append(reward)

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
                print(f"Run logged ({step_index} steps) for training data.")
            except Exception as e:
                print(f"Log run: {e}", file=sys.stderr)
        if record and obs_list and actions_list and rewards_list:
            try:
                saved = save_play_trajectory(obs_list, actions_list, rewards_list)
                if saved:
                    print(f"Trajectory saved to {saved} (run 'agentmongenesis train from play' to update the model).")
            except Exception as e:
                print(f"Save trajectory: {e}", file=sys.stderr)
    return step_index


class _DummyEnv(Env):
    observation_space = spaces.Dict({
        "screens": spaces.Box(low=0, high=255, shape=OUTPUT_SHAPE, dtype=np.uint8),
        "health": spaces.Box(low=0, high=1, shape=(1,)),
        "level": spaces.Box(low=-1, high=1, shape=(ENC_FREQS,)),
        "badges": spaces.MultiBinary(8),
        "events": spaces.MultiBinary((EVENT_FLAGS_END - EVENT_FLAGS_START) * 8),
        "map": spaces.Box(low=0, high=255, shape=(COORDS_PAD * 4, COORDS_PAD * 4, 1), dtype=np.uint8),
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
            "recent_actions": np.zeros(3, dtype=np.int8),
        }, {}

    def step(self, action):
        return self.reset()[0], 0.0, False, False, {}


def _make_dummy_env() -> _DummyEnv:
    return _DummyEnv()
