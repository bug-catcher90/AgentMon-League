#!/usr/bin/env python3
"""
Update the RL policy from recorded play trajectories (behavioral cloning).

When you play with RECORD_PLAY_TRAJECTORIES=1, each run saves (obs, action, reward)
to pokered_models/trajectories/run_<ts>.npz. This script loads those runs, loads
the latest checkpoint, and updates the policy to mimic the recorded actions (BC).
Saves the updated model so the next play/train uses the improved policy.

  RECORD_PLAY_TRAJECTORIES=1 agentmongenesis start new game   # play, then Ctrl+C
  agentmongenesis train from play                             # update policy from recorded data

Or run this module directly: python train_from_play.py (same as agentmongenesis train from play).

Optional env: RL_TRAJECTORIES_DIR, RL_BC_EPOCHS (3), RL_BC_BATCH_SIZE (64), RL_BC_LR (1e-4),
              RL_TRAIN_FROM_PLAY_SAVE=1 to also save as best_model.zip.
"""

import os
import sys
from pathlib import Path

import numpy as np
import torch

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from stable_baselines3 import PPO

from rl_agent.checkpoints import (
    get_checkpoint_dir,
    get_load_path,
    get_trajectories_dir,
    save_model,
)
from rl_agent.play_loop import _make_dummy_env

OBS_KEYS = ("screens", "health", "level", "badges", "events", "map", "recent_actions")


def load_trajectory(npz_path: Path) -> tuple[dict, np.ndarray, np.ndarray]:
    """Load one run_*.npz; return (obs_dict, actions, rewards)."""
    data = np.load(npz_path, allow_pickle=False)
    obs = {k: data[k] for k in OBS_KEYS if k in data}
    actions = data["actions"]
    rewards = data["rewards"]
    n = min(len(actions), len(rewards), *(obs[k].shape[0] for k in obs))
    obs = {k: v[:n] for k, v in obs.items()}
    return obs, actions[:n], rewards[:n]


def main():
    traj_dir = get_trajectories_dir()
    npz_files = sorted(traj_dir.glob("run_*.npz"))
    if not npz_files:
        print(
            "No trajectory files found in",
            traj_dir,
            file=sys.stderr,
        )
        print(
            "Set RECORD_PLAY_TRAJECTORIES=1 in test-agents/.env, run 'agentmongenesis start new game', "
            "play for a while, then Ctrl+C. Then run 'agentmongenesis train from play' again.",
            file=sys.stderr,
        )
        sys.exit(1)

    load_path = get_load_path(prefer_best=True)
    if not load_path or not Path(load_path).exists():
        print(
            "No checkpoint found. Run 'python train_rl_agent.py' (or train a few steps) so that "
            "pokered_models/runs/ has a .zip, then run 'agentmongenesis train from play' again.",
            file=sys.stderr,
        )
        sys.exit(1)

    epochs = int(os.environ.get("RL_BC_EPOCHS", "3"))
    batch_size = int(os.environ.get("RL_BC_BATCH_SIZE", "64"))
    lr = float(os.environ.get("RL_BC_LR", "1e-4"))
    save_as_best = os.environ.get("RL_TRAIN_FROM_PLAY_SAVE", "0").strip().lower() in ("1", "true", "yes")

    dummy = _make_dummy_env()
    model = PPO.load(load_path, env=dummy, custom_objects={"lr_schedule": 0, "clip_range": 0})
    policy = model.policy
    device = policy.device
    optimizer = torch.optim.Adam(policy.parameters(), lr=lr)

    # Concatenate all trajectories
    all_obs = {k: [] for k in OBS_KEYS}
    all_actions = []
    for npz_path in npz_files:
        obs, actions, _ = load_trajectory(npz_path)
        for k in OBS_KEYS:
            if k in obs:
                all_obs[k].append(obs[k])
        all_actions.append(actions)
    for k in OBS_KEYS:
        all_obs[k] = np.concatenate(all_obs[k], axis=0) if all_obs[k] else np.zeros((0,))
    all_actions = np.concatenate(all_actions, axis=0)
    n = all_actions.shape[0]
    for k in OBS_KEYS:
        if k in all_obs and all_obs[k].size > 0:
            n = min(n, all_obs[k].shape[0])
    if n == 0:
        print("No valid transitions in trajectories.", file=sys.stderr)
        sys.exit(1)
    for k in OBS_KEYS:
        if k in all_obs and all_obs[k].size > 0:
            all_obs[k] = all_obs[k][:n]
    all_actions = all_actions[:n]
    print(f"Loaded {n} transitions from {len(npz_files)} run(s). BC for {epochs} epochs, batch_size={batch_size}")

    indices = np.arange(n)
    for epoch in range(epochs):
        np.random.shuffle(indices)
        total_loss = 0.0
        batches = 0
        for start in range(0, n, batch_size):
            idx = indices[start : start + batch_size]
            if len(idx) < 2:
                continue
            obs_batch = {k: torch.as_tensor(all_obs[k][idx], dtype=torch.float32, device=device) for k in OBS_KEYS if k in all_obs and all_obs[k].size > 0}
            # screens and map are uint8 in env; policy may expect float
            if "screens" in obs_batch:
                obs_batch["screens"] = obs_batch["screens"].float() / 255.0
            if "map" in obs_batch:
                obs_batch["map"] = obs_batch["map"].float() / 255.0
            action_batch = torch.as_tensor(all_actions[idx], dtype=torch.long, device=device)
            log_prob, _ = policy.evaluate_actions(obs_batch, action_batch)
            loss = -log_prob.mean()
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(policy.parameters(), 0.5)
            optimizer.step()
            total_loss += loss.item()
            batches += 1
        avg = total_loss / batches if batches else 0
        print(f"  Epoch {epoch + 1}/{epochs} avg loss = {avg:.4f}")

    ckpt_dir = get_checkpoint_dir()
    out_path = ckpt_dir / "after_play_bc.zip"
    save_model(model, out_path)
    print(f"Saved updated model to {out_path}")
    if save_as_best:
        best_path = ckpt_dir / "best_model.zip"
        save_model(model, best_path)
        print(f"Also saved as {best_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
