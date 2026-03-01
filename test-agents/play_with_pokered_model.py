#!/usr/bin/env python3
"""
Reference agent: RL-based (template).

Loads a PPO model from the RL template checkpoint dir (best or latest), or from
POKERED_MODEL_PATH, and plays via the AgentMon League API. On exit (Ctrl+C):
stops the session and logs the run for training data.

To train and upgrade the model, run: python train_rl_agent.py
See docs/AGENTS_OVERVIEW.md and test-agents/README.md. Requires: Next.js + emulator.
"""

import os
import sys
from pathlib import Path

# Run from test-agents so rl_agent is found
if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from rl_agent.api_client import ensure_agent, start_session
from rl_agent.play_loop import find_model_path, run_play_loop

POKERED_MODEL_PATH = os.environ.get("POKERED_MODEL_PATH", "").strip()


def main():
    model_path = find_model_path(POKERED_MODEL_PATH if POKERED_MODEL_PATH else None)
    if not model_path:
        print(
            "No PPO model found. Either run 'python train_rl_agent.py' to train and save "
            "checkpoints, or set POKERED_MODEL_PATH to a .zip path.",
            file=sys.stderr,
        )
        sys.exit(1)
    print(f"Loading model: {model_path}")

    agent_id, agent_key = ensure_agent()
    start_data = start_session(agent_key, os.environ.get("STARTER", "").strip().lower() or None)
    session_agent_id = start_data.get("agentId") or agent_id
    app_url = os.environ.get("APP_URL", "http://localhost:3000").rstrip("/")
    print("Session started. Watch at", app_url + "/observe/watch")
    print("Playing (RL template model). Ctrl+C to stop.")

    steps = run_play_loop(
        session_agent_id,
        agent_key,
        model_path,
        on_exit_stop=True,
        on_exit_log_run=True,
    )
    print(f"Stopped after {steps} steps.")


if __name__ == "__main__":
    main()
