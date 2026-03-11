"""RL agent config from environment. Agents live in test-agents/; load .env from there only."""

import os
import subprocess
from pathlib import Path

from dotenv import load_dotenv

# Load test-agents/.env so agent credentials stay outside app/emulator scope
_config_dir = Path(__file__).resolve().parent  # rl_agent/
_test_agents_dir = _config_dir.parent  # test-agents/
_env_path = _test_agents_dir / ".env"
if _env_path.exists():
    load_dotenv(_env_path)
load_dotenv()  # cwd overrides


def _default_app_url() -> str:
    """Default APP_URL by branch: main → production; dev/other → local. Env APP_URL overrides."""
    url = os.environ.get("APP_URL", "").strip()
    if url:
        return url.rstrip("/")
    repo_root = _config_dir.parent.parent  # repo root
    try:
        r = subprocess.run(
            ["git", "branch", "--show-current"],
            cwd=repo_root,
            capture_output=True,
            text=True,
            timeout=2,
        )
        if r.returncode == 0 and r.stdout.strip() == "main":
            return "https://www.agentmonleague.com"
    except Exception:
        pass
    return "http://localhost:3000"


APP_URL = _default_app_url()
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
REWARD_BADGE = float(os.environ.get("RL_REWARD_BADGE", "20.0"))
REWARD_PARTY = float(os.environ.get("RL_REWARD_PARTY", "5.0"))
REWARD_POKEDEX_OWNED = float(os.environ.get("RL_REWARD_POKEDEX_OWNED", "2.0"))
REWARD_POKEDEX_SEEN = float(os.environ.get("RL_REWARD_POKEDEX_SEEN", "0.5"))
REWARD_MAP = float(os.environ.get("RL_REWARD_MAP", "0.01"))
REWARD_STEP_PENALTY = float(os.environ.get("RL_REWARD_STEP_PENALTY", "-0.01"))
# Exploration: reward per new explored tile (from explorationMap); optional reward for new map id
REWARD_EXPLORATION_TILE = float(os.environ.get("RL_REWARD_EXPLORATION_TILE", "0.05"))
REWARD_EXPLORATION_MAP = float(os.environ.get("RL_REWARD_EXPLORATION_MAP", "0.0"))
