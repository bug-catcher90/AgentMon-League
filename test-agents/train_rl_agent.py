#!/usr/bin/env python3
"""
RL agent template: train against the platform API and save checkpoints.

Registers with AgentMon League, starts a session per episode, collects experience
via the emulator API, and runs PPO updates. Saves checkpoints and metrics so
you can upgrade (load best/latest) when playing. Next.js and emulator must be running.

  cd test-agents && python train_rl_agent.py

Env: RL_SAVE_EVERY_STEPS, RL_TRAIN_TOTAL_STEPS, RL_EPISODE_MAX_STEPS, RL_SAVE_BEST,
     RL_CHECKPOINT_DIR, RL_METRICS_DIR, plus APP_URL, STARTER. See rl_agent/config.py.
"""

import sys
from pathlib import Path

# Run from test-agents so rl_agent package is found
if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback
from stable_baselines3.common.vec_env import DummyVecEnv

from rl_agent.api_client import ensure_agent
from rl_agent.checkpoints import (
    get_checkpoint_dir,
    load_latest_path,
    log_metrics,
    save_model,
)
from rl_agent.config import (
    EPISODE_MAX_STEPS,
    SAVE_BEST,
    SAVE_EVERY_STEPS,
    STARTER,
    TRAIN_TOTAL_STEPS,
)
from rl_agent.env import EmulatorEnv


class SaveAndLogCallback(BaseCallback):
    def __init__(self, save_every: int, checkpoint_dir: Path, save_best: bool, verbose=0):
        super().__init__(verbose)
        self.save_every = save_every
        self.checkpoint_dir = checkpoint_dir
        self.save_best = save_best
        self.best_mean_reward = -float("inf")
        self.episode_count = 0
        self.total_steps = 0

    def _on_step(self) -> bool:
        self.total_steps = self.num_timesteps
        # Save periodic checkpoint
        if self.total_steps > 0 and self.total_steps % self.save_every == 0:
            path = self.checkpoint_dir / f"poke_{self.total_steps}_steps.zip"
            save_model(self.model, path)
            if self.verbose:
                print(f"  Saved checkpoint: {path}")

        # Episode end: SB3 stores in ep_info_buffer (reward, length)
        if len(self.model.ep_info_buffer) > 0:
            for info in self.model.ep_info_buffer:
                ep_rew = info.get("r", info.get("ep_rew", 0))
                ep_len = info.get("l", info.get("ep_len", 0))
                self.episode_count += 1
                log_metrics(
                    episode=self.episode_count,
                    total_steps=self.total_steps,
                    episode_reward=ep_rew,
                    episode_len=ep_len,
                )
                if self.verbose:
                    print(f"  Episode {self.episode_count} reward={ep_rew:.1f} len={ep_len}")
                if self.save_best and ep_rew > self.best_mean_reward:
                    self.best_mean_reward = ep_rew
                    best_path = self.checkpoint_dir / "best_model.zip"
                    save_model(self.model, best_path)
                    if self.verbose:
                        print(f"  New best model saved: {best_path}")
        return True


def main():
    print("RL agent template: training against platform API.")
    print("Ensure Next.js (pnpm dev) and emulator are running.")
    agent_id, agent_key = ensure_agent()
    print(f"Agent {agent_id}; episodes max {EPISODE_MAX_STEPS} steps.")

    def make_env():
        return EmulatorEnv(agent_id, agent_key, STARTER)

    env = DummyVecEnv([make_env])
    checkpoint_dir = get_checkpoint_dir()

    # Load existing or create new
    load_path = load_latest_path()
    if load_path:
        print(f"Resuming from {load_path}")
        model = PPO.load(
            load_path,
            env=env,
            custom_objects={"lr_schedule": 0, "clip_range": 0},
        )
    else:
        print("Starting new PPO model.")
        model = PPO(
            "MultiInputPolicy",
            env,
            verbose=1,
            n_steps=128,
            batch_size=64,
            n_epochs=3,
            learning_rate=3e-4,
        )

    callback = SaveAndLogCallback(
        save_every=SAVE_EVERY_STEPS,
        checkpoint_dir=checkpoint_dir,
        save_best=SAVE_BEST,
        verbose=1,
    )
    model.learn(total_timesteps=TRAIN_TOTAL_STEPS, callback=callback, progress_bar=False)
    env.close()

    # Final save
    final_path = checkpoint_dir / f"poke_{TRAIN_TOTAL_STEPS}_steps.zip"
    save_model(model, final_path)
    print(f"Done. Checkpoints in {checkpoint_dir}. Play with: python play_with_pokered_model.py")


if __name__ == "__main__":
    main()
