#!/usr/bin/env python3
"""
AgentMon Genesis CLI — RL agent: start, load, save, stop.

  agentmongenesis start new game [--starter bulbasaur|charmander|squirtle]
  agentmongenesis load last save
  agentmongenesis save [--label "after first gym"]
  agentmongenesis stop

Start and load run play-with-learning: the agent learns and updates its policy while playing.
Policy is loaded from checkpoint and saved on exit; game state is saved on exit.

Requires AGENT_ID and AGENT_KEY in env (or omit to register a new agent).
Run from repo root or with test-agents on PYTHONPATH so rl_agent is found.
"""

import argparse
import os
import sys
from pathlib import Path

# Ensure test-agents is on path when installed as a console script
_here = Path(__file__).resolve().parent
if str(_here) not in sys.path:
    sys.path.insert(0, str(_here))

from rl_agent.api_client import ensure_agent, list_saves, save_session as api_save_session, stop_session
from rl_agent.config import PLAY_MAX_STEPS
from rl_agent.play_loop import run_play_with_learning


def _app_url() -> str:
    return os.environ.get("APP_URL", "http://localhost:3000").rstrip("/")


def cmd_start_new_game(args: argparse.Namespace) -> int:
    starter = (args.starter or os.environ.get("STARTER", "") or "").strip().lower()
    if starter and starter not in ("bulbasaur", "charmander", "squirtle"):
        starter = None
    agent_id, agent_key = ensure_agent()
    print("Starting new game. Watch at", _app_url() + "/observe/watch")
    print("Playing and learning (Ctrl+C to stop; policy and game saved on exit).")
    steps = run_play_with_learning(
        agent_id,
        agent_key,
        starter=starter or None,
        max_steps=PLAY_MAX_STEPS if PLAY_MAX_STEPS > 0 else 0,
    )
    print(f"Stopped after {steps} steps.")
    return 0


def cmd_save(args: argparse.Namespace) -> int:
    """Save the current game to the platform (so you can load it later with 'load last save')."""
    _agent_id, agent_key = ensure_agent()
    label = getattr(args, "label", None) or ""
    try:
        data = api_save_session(agent_key, label=label if label else None)
        print("Game saved.", "Save ID:", data.get("saveId", "—"), data.get("label") or "")
        return 0
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 1


def cmd_load_last_save(args: argparse.Namespace) -> int:
    agent_id, agent_key = ensure_agent()
    saves = list_saves(agent_key)
    if not saves:
        print(
            "No saved games. Run 'agentmongenesis start new game', play, then Ctrl+C — "
            "the game is saved automatically so you can 'load last save' next time.",
            file=sys.stderr,
        )
        return 1
    last = saves[0]
    save_id = last["id"]
    print("Loaded save:", last.get("label") or save_id, "| Watch at", _app_url() + "/observe/watch")
    print("Playing and learning (Ctrl+C to stop; policy and game saved on exit).")
    steps = run_play_with_learning(
        agent_id,
        agent_key,
        load_session_id=save_id,
        max_steps=PLAY_MAX_STEPS if PLAY_MAX_STEPS > 0 else 0,
    )
    print(f"Stopped after {steps} steps.")
    return 0


def cmd_stop(args: argparse.Namespace) -> int:
    agent_id, agent_key = ensure_agent()
    stop_session(agent_key)
    print("Session stopped. Playtime recorded.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="agentmongenesis",
        description="AgentMon Genesis — start, load, save, stop. Play with learning.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # start new game
    p_start = sub.add_parser("start", help="Start a game session")
    p_start_sub = p_start.add_subparsers(dest="subcommand", required=True)
    p_new = p_start_sub.add_parser("new", help="Start a new game (optionally with starter)")
    p_new.add_argument("--starter", choices=["bulbasaur", "charmander", "squirtle"], default=None)
    p_new_game = p_new.add_subparsers(dest="subcommand2", required=True)
    p_game = p_new_game.add_parser("game", help="Start a new game")
    p_game.set_defaults(func=cmd_start_new_game)

    # load last save
    p_load = sub.add_parser("load", help="Load a saved game")
    p_load_sub = p_load.add_subparsers(dest="subcommand", required=True)
    p_last = p_load_sub.add_parser("last", help="Load the most recent save")
    p_last_save = p_last.add_subparsers(dest="subcommand2", required=True)
    p_save = p_last_save.add_parser("save", help="Use the last saved game")
    p_save.set_defaults(func=cmd_load_last_save)

    # stop
    p_stop = sub.add_parser("stop", help="Stop the current session and record playtime")
    p_stop.set_defaults(func=cmd_stop)

    # save
    p_save_cmd = sub.add_parser("save", help="Save the current game to the platform (resume later with 'load last save')")
    p_save_cmd.set_defaults(func=cmd_save)
    p_save_cmd.add_argument("--label", type=str, default=None, help="Optional label for this save (e.g. 'after first gym')")

    args = parser.parse_args()
    func = getattr(args, "func", None)
    if func is not None:
        return func(args)
    parser.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
