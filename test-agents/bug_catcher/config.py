"""Bug-Catcher configuration from environment."""

import os
import subprocess
from pathlib import Path

try:
    from dotenv import load_dotenv
    # Agents live outside the app: load .env from test-agents/ only (no project root).
    _config_dir = Path(__file__).resolve().parent  # bug_catcher/
    _test_agents_dir = _config_dir.parent  # test-agents/
    _env_path = _test_agents_dir / ".env"
    if _env_path.exists():
        load_dotenv(_env_path)
    load_dotenv()  # cwd .env overrides (e.g. when run from test-agents/)
except ImportError:
    pass  # optional: use env vars only if python-dotenv not installed

_config_dir = Path(__file__).resolve().parent
_test_agents_dir = _config_dir.parent


def _is_main_branch() -> bool:
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
    """main → production; dev/other → local. Env APP_URL overrides unless on main with localhost (then use production)."""
    url = os.environ.get("APP_URL", "").strip().rstrip("/")
    on_main = _is_main_branch()
    if on_main:
        # On main: use production unless user set a non-localhost URL
        if url and "localhost" not in url and "127.0.0.1" not in url:
            return url
        return "https://www.agentmonleague.com"
    # On dev/other: env overrides, else localhost
    return url if url else "http://localhost:3000"


APP_URL = _default_app_url()
# Bug-Catcher uses its own credentials so it doesn't play as AgentMon Genesis.
# Set BUG_CATCHER_AGENT_ID and BUG_CATCHER_AGENT_KEY after first run (CLI prints them).
AGENT_ID = os.environ.get("BUG_CATCHER_AGENT_ID", "").strip() or None
AGENT_KEY = os.environ.get("BUG_CATCHER_AGENT_KEY", "").strip() or None
STARTER = os.environ.get("STARTER", "").strip().lower() or None
if STARTER and STARTER not in ("bulbasaur", "charmander", "squirtle"):
    STARTER = None

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip() or None
MOLTBOOK_API_KEY = os.environ.get("MOLTBOOK_API_KEY", "").strip() or None
MOLTBOOK_BASE = "https://www.moltbook.com/api/v1"

_BASE = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("BUG_CATCHER_DATA_DIR", str(_BASE.parent / "bug_catcher_data")))
RAW_LOGS_DIR = DATA_DIR / "raw_logs"
MEMORY_DATASET_PATH = DATA_DIR / "memory_dataset.jsonl"

STEP_INTERVAL = float(os.environ.get("STEP_INTERVAL", "0.3"))
SAVE_EVERY_STEPS = int(os.environ.get("BUG_CATCHER_SAVE_EVERY_STEPS", "500"))
SHORT_TERM_LEN = int(os.environ.get("BUG_CATCHER_MEMORY_LEN", "12"))
MAX_STEPS_PER_SESSION = int(os.environ.get("BUG_CATCHER_MAX_STEPS", "0"))
# Max actions to execute per LLM call (re-prompt when screen text appears or queue empty). Reduces API cost.
MAX_ACTIONS_PER_CALL = int(os.environ.get("BUG_CATCHER_MAX_ACTIONS_PER_CALL", "6"))

MEMORY_UPDATE_MODEL = os.environ.get("BUG_CATCHER_MEMORY_MODEL", "gpt-4o")
MEMORY_UPDATE_MAX_ENTRIES = int(os.environ.get("BUG_CATCHER_MEMORY_UPDATE_MAX_ENTRIES", "200"))

# When True, fetch game screenshot before each LLM call and send it to a vision-capable model (e.g. gpt-4o).
USE_VISION = os.environ.get("BUG_CATCHER_USE_VISION", "1").strip().lower() in ("1", "true", "yes")

VALID_ACTIONS = ["up", "down", "left", "right", "a", "b", "start", "select", "pass"]
