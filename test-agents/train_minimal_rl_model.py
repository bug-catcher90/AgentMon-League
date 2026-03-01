#!/usr/bin/env python3
"""
Train a minimal PPO model with the same observation/action space as PokemonRedExperiments v2.
Saves a .zip to test-agents/pokered_models/runs/ so play_with_pokered_model.py can load it.
This is only for testing the RL agent pipeline; for real play use a model trained in
PokemonRedExperiments (v2/baseline_fast_v2.py).

Run (from test-agents, with venv active):
  pip install -r requirements-pokered.txt
  python train_minimal_rl_model.py
"""

from pathlib import Path

import numpy as np
from gymnasium import Env, spaces
from stable_baselines3 import PPO
from stable_baselines3.common.env_checker import check_env
from stable_baselines3.common.vec_env import DummyVecEnv

# Must match play_with_pokered_model.py (v2 layout)
OUTPUT_SHAPE = (72, 80, 3)
COORDS_PAD = 12
EVENT_FLAGS_START = 0xD747
EVENT_FLAGS_END = 0xD87E
ENC_FREQS = 8
N_ACTIONS = 7  # down, left, right, up, a, b, start


def make_v2_observation_space():
    return spaces.Dict({
        "screens": spaces.Box(low=0, high=255, shape=OUTPUT_SHAPE, dtype=np.uint8),
        "health": spaces.Box(low=0, high=1, shape=(1,), dtype=np.float32),
        "level": spaces.Box(low=-1, high=1, shape=(ENC_FREQS,), dtype=np.float32),
        "badges": spaces.MultiBinary(8),
        "events": spaces.MultiBinary((EVENT_FLAGS_END - EVENT_FLAGS_START) * 8),
        "map": spaces.Box(low=0, high=255, shape=(COORDS_PAD * 4, COORDS_PAD * 4, 1), dtype=np.uint8),
        "recent_actions": spaces.MultiDiscrete([N_ACTIONS] * 3),
    })


class MinimalV2Env(Env):
    """Minimal env that matches v2 obs/action space. Used only to produce a valid .zip."""

    def __init__(self):
        super().__init__()
        self.observation_space = make_v2_observation_space()
        self.action_space = spaces.Discrete(N_ACTIONS)
        self._step = 0

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        self._step = 0
        return self._obs(), {}

    def step(self, action):
        self._step += 1
        obs = self._obs()
        reward = 0.0
        terminated = self._step >= 1000
        truncated = False
        return obs, reward, terminated, truncated, {}

    def _obs(self):
        return {
            "screens": np.zeros(OUTPUT_SHAPE, dtype=np.uint8),
            "health": np.array([1.0], dtype=np.float32),
            "level": np.zeros(ENC_FREQS, dtype=np.float32),
            "badges": np.zeros(8, dtype=np.int8),
            "events": np.zeros((EVENT_FLAGS_END - EVENT_FLAGS_START) * 8, dtype=np.int8),
            "map": np.zeros((COORDS_PAD * 4, COORDS_PAD * 4, 1), dtype=np.uint8),
            "recent_actions": np.zeros(3, dtype=np.int8),
        }


def main():
    base = Path(__file__).resolve().parent
    runs_dir = base / "pokered_models" / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    out_path = runs_dir / "poke_test_500_steps.zip"

    env = MinimalV2Env()
    check_env(env, skip_render_check=True)
    vec_env = DummyVecEnv([lambda: MinimalV2Env()])

    print("Training minimal PPO (500 steps) for v2-compatible .zip...")
    model = PPO(
        "MultiInputPolicy",
        vec_env,
        verbose=0,
        n_steps=64,
        batch_size=32,
        n_epochs=2,
    )
    model.learn(total_timesteps=500)
    model.save(str(out_path))
    vec_env.close()
    print(f"Saved: {out_path}")
    print("Run: python play_with_pokered_model.py  (Next.js + emulator must be running)")


if __name__ == "__main__":
    main()
