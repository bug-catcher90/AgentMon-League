"""
RL agent template for AgentMon League.

Train against the platform API (emulator), save checkpoints and metrics locally,
then play using the best or latest model. Other agents can copy this template
and plug in their own reward or observation logic.

Usage:
  Train:  python -m test-agents.train_rl_agent   (or: python train_rl_agent.py)
  Play:   python play_with_pokered_model.py     (loads from template checkpoint dir)
"""

from rl_agent.api_client import (
    ensure_agent,
    get_frame,
    get_state,
    register,
    run_action,
    start_session,
)
from rl_agent.checkpoints import (
    get_checkpoint_dir,
    get_load_path,
    load_best_path,
    load_latest_path,
    log_metrics,
    save_model,
)
from rl_agent.env import EmulatorEnv
from rl_agent.obs_reward import (
    V2_ACTION_NAMES,
    build_obs_from_frame_and_state,
    compute_reward,
)

__all__ = [
    "EmulatorEnv",
    "V2_ACTION_NAMES",
    "build_obs_from_frame_and_state",
    "compute_reward",
    "ensure_agent",
    "get_checkpoint_dir",
    "get_frame",
    "get_load_path",
    "get_state",
    "load_best_path",
    "load_latest_path",
    "log_metrics",
    "register",
    "run_action",
    "save_model",
    "start_session",
]
