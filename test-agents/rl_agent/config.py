"""RL agent config from environment. Agents live in test-agents/; load .env from there only."""

import os
from pathlib import Path

from dotenv import load_dotenv

# Load test-agents/.env so agent credentials stay outside app/emulator scope
_config_dir = Path(__file__).resolve().parent  # rl_agent/
_test_agents_dir = _config_dir.parent  # test-agents/
_env_path = _test_agents_dir / ".env"
if _env_path.exists():
    load_dotenv(_env_path)
load_dotenv()  # cwd overrides

APP_URL = os.environ.get("APP_URL", "http://localhost:3000").rstrip("/")
AGENT_ID = os.environ.get("AGENT_ID", "").strip()
AGENT_KEY = os.environ.get("AGENT_KEY", "").strip()
STARTER = os.environ.get("STARTER", "").strip().lower() or None

_BASE = Path(__file__).resolve().parent.parent
CHECKPOINT_DIR = os.environ.get("RL_CHECKPOINT_DIR", str(_BASE / "pokered_models" / "runs"))
METRICS_DIR = os.environ.get("RL_METRICS_DIR", str(_BASE / "pokered_models" / "metrics"))

SAVE_EVERY_STEPS = int(os.environ.get("RL_SAVE_EVERY_STEPS", "5000"))
SAVE_BEST = os.environ.get("RL_SAVE_BEST", "1").strip().lower() in ("1", "true", "yes")
TRAIN_TOTAL_STEPS = int(os.environ.get("RL_TRAIN_TOTAL_STEPS", "50000"))
EPISODE_MAX_STEPS = int(os.environ.get("RL_EPISODE_MAX_STEPS", "2000"))
# Optional: max steps during play (0 = no limit, play until Ctrl+C)
PLAY_MAX_STEPS = int(os.environ.get("RL_PLAY_MAX_STEPS", "0"))
# Auto-save game to platform every N steps during play (0 = disabled). Default 1000.
PLAY_SAVE_EVERY_STEPS = int(os.environ.get("RL_PLAY_SAVE_EVERY_STEPS", "1000"))
# Record (obs, action, reward) during play for later train_from_play (set RECORD_PLAY_TRAJECTORIES=1)
RECORD_PLAY_TRAJECTORIES = os.environ.get("RECORD_PLAY_TRAJECTORIES", "0").strip().lower() in ("1", "true", "yes")
TRAJECTORIES_DIR = os.environ.get("RL_TRAJECTORIES_DIR", str(_BASE / "pokered_models" / "trajectories"))

REWARD_BADGE = float(os.environ.get("RL_REWARD_BADGE", "20.0"))
REWARD_PARTY = float(os.environ.get("RL_REWARD_PARTY", "5.0"))
REWARD_POKEDEX_OWNED = float(os.environ.get("RL_REWARD_POKEDEX_OWNED", "2.0"))
REWARD_POKEDEX_SEEN = float(os.environ.get("RL_REWARD_POKEDEX_SEEN", "0.5"))
REWARD_MAP = float(os.environ.get("RL_REWARD_MAP", "0.01"))
REWARD_STEP_PENALTY = float(os.environ.get("RL_REWARD_STEP_PENALTY", "-0.01"))
# Exploration: reward per new explored tile (from explorationMap); optional reward for new map id
REWARD_EXPLORATION_TILE = float(os.environ.get("RL_REWARD_EXPLORATION_TILE", "0.05"))
REWARD_EXPLORATION_MAP = float(os.environ.get("RL_REWARD_EXPLORATION_MAP", "0.0"))
