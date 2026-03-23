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


def _is_main_branch() -> bool:
    """
    Return True when we should treat this run as "main"/production.

    Priority:
    - Explicit env override: AGENTMON_BRANCH=main (or BRANCH/RAILWAY_GIT_BRANCH).
    - Else, best‑effort git branch detection.
    """
    env_branch = (
        os.environ.get("AGENTMON_BRANCH")
        or os.environ.get("BRANCH")
        or os.environ.get("RAILWAY_GIT_BRANCH")
    )
    if env_branch and env_branch.strip() == "main":
        return True

    repo_root = _config_dir.parent.parent  # repo root
    try:
        r = subprocess.run(
            ["git", "branch", "--show-current"],
            cwd=repo_root,
            capture_output=True,
            text=True,
            timeout=2,
        )
        return r.returncode == 0 and r.stdout.strip() == "main"
    except Exception:
        return False


def _default_app_url() -> str:
    """APP_URL override first; otherwise main→production and others→localhost.

    - If APP_URL is explicitly set, always trust it.
    - Else on main: use production URL.
    - Else default to localhost.
    """
    url = os.environ.get("APP_URL", "").strip().rstrip("/")
    if url:
        return url
    if _is_main_branch():
        return "https://www.agentmonleague.com"
    return "http://localhost:3000"


APP_URL = _default_app_url()
AGENT_ID = os.environ.get("AGENT_ID", "").strip()
AGENT_KEY = os.environ.get("AGENT_KEY", "").strip()
STARTER = os.environ.get("STARTER", "").strip().lower() or None

_BASE = Path(__file__).resolve().parent.parent
CHECKPOINT_DIR = os.environ.get("RL_CHECKPOINT_DIR", str(_BASE / "pokered_models" / "runs"))
METRICS_DIR = os.environ.get("RL_METRICS_DIR", str(_BASE / "pokered_models" / "metrics"))

SAVE_EVERY_STEPS = int(os.environ.get("RL_SAVE_EVERY_STEPS", "10000"))
SAVE_BEST = os.environ.get("RL_SAVE_BEST", "1").strip().lower() in ("1", "true", "yes")
TRAIN_TOTAL_STEPS = int(os.environ.get("RL_TRAIN_TOTAL_STEPS", "500000"))
EPISODE_MAX_STEPS = int(os.environ.get("RL_EPISODE_MAX_STEPS", "5000"))
# Optional: max steps during play (0 = no limit, play until Ctrl+C)
PLAY_MAX_STEPS = int(os.environ.get("RL_PLAY_MAX_STEPS", "0"))
# Auto-save game to platform every N steps during play (0 = disabled). Default 1000.
PLAY_SAVE_EVERY_STEPS = int(os.environ.get("RL_PLAY_SAVE_EVERY_STEPS", "1000"))
REWARD_BADGE = float(os.environ.get("RL_REWARD_BADGE", "100.0"))
REWARD_PARTY = float(os.environ.get("RL_REWARD_PARTY", "10.0"))
REWARD_POKEDEX_OWNED = float(os.environ.get("RL_REWARD_POKEDEX_OWNED", "5.0"))
REWARD_POKEDEX_SEEN = float(os.environ.get("RL_REWARD_POKEDEX_SEEN", "1.0"))
REWARD_MAP = float(os.environ.get("RL_REWARD_MAP", "0.0"))
REWARD_STEP_PENALTY = float(os.environ.get("RL_REWARD_STEP_PENALTY", "-0.005"))
# Exploration: reward per new explored tile (from explorationMap); optional reward for new map id.
# Keep small so it encourages discovering areas but does not dominate badges / catches.
REWARD_EXPLORATION_TILE = float(os.environ.get("RL_REWARD_EXPLORATION_TILE", "0.01"))
REWARD_EXPLORATION_MAP = float(os.environ.get("RL_REWARD_EXPLORATION_MAP", "2.0"))
# Battle and level-up (stage-1 objective shaping)
REWARD_BEAT_POKEMON = float(os.environ.get("RL_REWARD_BEAT_POKEMON", "2.0"))
REWARD_LEVEL_UP = float(os.environ.get("RL_REWARD_LEVEL_UP", "3.0"))
# Stage-1 objective bonuses (visit Center/Mart, buy balls, reach 3 catches, etc.)
REWARD_VISIT_POKECENTER = float(os.environ.get("RL_REWARD_VISIT_POKECENTER", "4.0"))
REWARD_VISIT_MART = float(os.environ.get("RL_REWARD_VISIT_MART", "2.0"))
REWARD_BUY_POKEBALLS = float(os.environ.get("RL_REWARD_BUY_POKEBALLS", "1.0"))
REWARD_FIRST_THREE_CATCHES = float(os.environ.get("RL_REWARD_FIRST_THREE_CATCHES", "8.0"))
