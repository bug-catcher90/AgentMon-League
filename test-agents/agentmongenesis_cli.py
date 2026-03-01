#!/usr/bin/env python3
"""
AgentMon Genesis CLI — easy commands to start, load, stop, save, and train from play.

  agentmongenesis start new game [--starter bulbasaur|charmander|squirtle]
  agentmongenesis load last save
  agentmongenesis save [--label "after first gym"]
  agentmongenesis stop
  agentmongenesis train from play

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

from rl_agent.api_client import (
    check_session_ready,
    ensure_agent,
    list_saves,
    save_session as api_save_session,
    start_session,
    stop_session,
)
from rl_agent.config import PLAY_MAX_STEPS, RECORD_PLAY_TRAJECTORIES
from rl_agent.play_loop import find_model_path, run_play_loop


def _app_url() -> str:
    return os.environ.get("APP_URL", "http://localhost:3000").rstrip("/")


def cmd_start_new_game(args: argparse.Namespace) -> int:
    starter = (args.starter or os.environ.get("STARTER", "") or "").strip().lower()
    if starter and starter not in ("bulbasaur", "charmander", "squirtle"):
        starter = None
    model_path = find_model_path()
    if not model_path:
        print(
            "No PPO model found. Run training first (e.g. python train_rl_agent.py) or set POKERED_MODEL_PATH.",
            file=sys.stderr,
        )
        return 1
    agent_id, agent_key = ensure_agent()
    start_data = start_session(agent_key, starter=starter or None)
    # Use agent id from start response so we match the session (important after DB reset when .env has stale AGENT_ID)
    session_agent_id = start_data.get("agentId") or agent_id
    try:
        check_session_ready(session_agent_id)
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 1
    print("New game started. Watch at", _app_url() + "/observe/watch")
    if not RECORD_PLAY_TRAJECTORIES:
        print("Tip: set RECORD_PLAY_TRAJECTORIES=1 in .env to record data for 'train from play'.")
    print("Playing (Ctrl+C to stop; game will be saved so you can 'load last save').")
    steps = run_play_loop(
        session_agent_id,
        agent_key,
        model_path,
        on_exit_stop=True,
        on_exit_log_run=True,
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
    model_path = find_model_path()
    if not model_path:
        print(
            "No PPO model found. Run training first or set POKERED_MODEL_PATH.",
            file=sys.stderr,
        )
        return 1
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
    start_data = start_session(agent_key, load_session_id=save_id)
    session_agent_id = start_data.get("agentId") or agent_id
    try:
        check_session_ready(session_agent_id)
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 1
    print("Loaded save:", last.get("label") or save_id, "| Watch at", _app_url() + "/observe/watch")
    if not RECORD_PLAY_TRAJECTORIES:
        print("Tip: set RECORD_PLAY_TRAJECTORIES=1 in .env to record data for 'train from play'.")
    print("Playing (Ctrl+C to stop; game will be saved so you can 'load last save').")
    steps = run_play_loop(
        session_agent_id,
        agent_key,
        model_path,
        on_exit_stop=True,
        on_exit_log_run=True,
        max_steps=PLAY_MAX_STEPS if PLAY_MAX_STEPS > 0 else 0,
    )
    print(f"Stopped after {steps} steps.")
    return 0


def cmd_stop(args: argparse.Namespace) -> int:
    agent_id, agent_key = ensure_agent()
    stop_session(agent_key)
    print("Session stopped. Playtime recorded; use training to update the model with new data.")
    return 0


def cmd_train_from_play(args: argparse.Namespace) -> int:
    """Update the policy from recorded play trajectories (behavioral cloning)."""
    import train_from_play
    return train_from_play.main()


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="agentmongenesis",
        description="AgentMon Genesis — start, load, stop, save, and train from play.",
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

    # train from play
    p_train = sub.add_parser("train", help="Update the model from data")
    p_train_sub = p_train.add_subparsers(dest="subcommand", required=True)
    p_train_from = p_train_sub.add_parser("from", help="Train from recorded data")
    p_train_from_sub = p_train_from.add_subparsers(dest="subcommand2", required=True)
    p_train_play = p_train_from_sub.add_parser("play", help="Use recorded play trajectories (behavioral cloning)")
    p_train_play.set_defaults(func=cmd_train_from_play)

    args = parser.parse_args()
    func = getattr(args, "func", None)
    if func is not None:
        return func(args)
    parser.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
