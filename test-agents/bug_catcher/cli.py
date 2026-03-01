"""Bug-Catcher CLI: start, load, save, stop, update-memory."""

import argparse
import os
import sys
from pathlib import Path

# Run from test-agents or with PYTHONPATH=test-agents
_here = Path(__file__).resolve().parent
if str(_here.parent) not in sys.path:
    sys.path.insert(0, str(_here.parent))

from bug_catcher.api_client import (
    check_session_ready,
    list_saves,
    publish_dataset as api_publish_dataset,
    publish_model_placeholder as api_publish_model,
    register as api_register,
    require_credentials,
    save_session as api_save_session,
    start_session,
    stop_session,
)
from bug_catcher.config import APP_URL, MEMORY_DATASET_PATH, MEMORY_UPDATE_MODEL
from bug_catcher.memory_update import run_memory_update
from bug_catcher.moltbook_client import post_session_summary
from bug_catcher.play_loop import run_play_loop
from bug_catcher.storage import ensure_dirs, raw_log_path


def _publish_on_exit(agent_key: str) -> None:
    """Publish current dataset (memory) and model placeholder (LLM in use) to agent profile."""
    if MEMORY_DATASET_PATH.exists():
        try:
            api_publish_dataset(agent_key, str(MEMORY_DATASET_PATH), label="memory")
            print("Published dataset (memory) to profile.")
        except Exception as e:
            print(f"Publish dataset: {e}", file=sys.stderr)
    try:
        api_publish_model(agent_key, model_name=MEMORY_UPDATE_MODEL or "gpt-4o")
        print("Published model (LLM in use) to profile.")
    except Exception as e:
        print(f"Publish model: {e}", file=sys.stderr)


def _run_id() -> str:
    import time
    return str(int(time.time() * 1000))


def _print_credentials(agent_id: str, agent_key: str) -> None:
    print("Registered as Bug-Catcher. Add these to .env so 'bugcatcher start new game' uses this agent:")
    print(f"  BUG_CATCHER_AGENT_ID={agent_id}")
    print(f"  BUG_CATCHER_AGENT_KEY={agent_key}")
    print(f"  Profile: {APP_URL}/observe/agents/{agent_id}")
    print("  When playing you appear on:", APP_URL + "/observe/watch")
    print()


def cmd_register(args: argparse.Namespace) -> int:
    try:
        agent_id, agent_key = api_register()
        _print_credentials(agent_id, agent_key)
        return 0
    except Exception as e:
        print(f"Registration failed: {e}", file=sys.stderr)
        return 1


DEFAULT_STARTER = "charmander"  # used when no --starter and no STARTER env (so new game always has a starter)


def cmd_start_new_game(args: argparse.Namespace) -> int:
    try:
        agent_id, agent_key = require_credentials()
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 1
    starter = getattr(args, "starter", None) or os.environ.get("STARTER", "").strip().lower()
    if starter not in ("bulbasaur", "charmander", "squirtle"):
        starter = DEFAULT_STARTER
    start_data = start_session(agent_key, starter=starter)
    session_agent_id = start_data.get("agentId") or agent_id
    try:
        check_session_ready(session_agent_id)
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 1
    ensure_dirs()
    run_id = _run_id()
    print("New game started (starter:", starter + "). Player name is your agent's name (Bug-Catcher); rival is 'Rival'.")
    print("You appear on Watch and Home when playing:", APP_URL + "/observe/watch")
    print("Playing (Ctrl+C to stop; game will be saved and memory updated).")
    steps = run_play_loop(
        session_agent_id,
        agent_key,
        run_id,
        on_exit_stop=True,
        on_exit_save=True,
        on_exit_update_memory=True,
    )
    print(f"Stopped after {steps} steps.")
    try:
        _publish_on_exit(agent_key)
    except Exception:
        pass
    try:
        if post_session_summary(steps):
            print("Posted session summary to Moltbook.")
    except Exception:
        pass
    return 0


def cmd_load_last_save(args: argparse.Namespace) -> int:
    try:
        agent_id, agent_key = require_credentials()
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 1
    saves = list_saves(agent_key)
    if not saves:
        print("No saved games. Use 'bugcatcher start new game' first.", file=sys.stderr)
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
    run_id = _run_id()
    print("Loaded save:", last.get("label") or save_id, "| You appear on Watch when playing:", APP_URL + "/observe/watch")
    print("Playing (Ctrl+C to stop).")
    steps = run_play_loop(
        session_agent_id,
        agent_key,
        run_id,
        on_exit_stop=True,
        on_exit_save=True,
        on_exit_update_memory=True,
    )
    print(f"Stopped after {steps} steps.")
    try:
        _publish_on_exit(agent_key)
    except Exception:
        pass
    try:
        post_session_summary(steps)
    except Exception:
        pass
    return 0


def cmd_save(args: argparse.Namespace) -> int:
    try:
        _, agent_key = require_credentials()
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 1
    label = getattr(args, "label", None) or ""
    try:
        data = api_save_session(agent_key, label=label if label else None)
        print("Game saved.", "Save ID:", data.get("saveId", "—"), data.get("label") or "")
        return 0
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 1


def cmd_stop(args: argparse.Namespace) -> int:
    try:
        _, agent_key = require_credentials()
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 1
    stop_session(agent_key)
    print("Session stopped. Run 'bugcatcher update-memory' to process raw logs into memory.")
    return 0


def cmd_update_memory(args: argparse.Namespace) -> int:
    run_id = getattr(args, "run_id", None)
    try:
        n = run_memory_update(run_id=run_id or None)
        print(f"Memory dataset updated with {n} new entries.")
        return 0
    except FileNotFoundError as e:
        print(str(e), file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


def cmd_publish_dataset(args: argparse.Namespace) -> int:
    try:
        _, agent_key = require_credentials()
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 1
    path = getattr(args, "file", None) or str(MEMORY_DATASET_PATH)
    if not Path(path).exists():
        print(f"File not found: {path}. Play and run 'bugcatcher update-memory' to build memory first.", file=sys.stderr)
        return 1
    label = getattr(args, "label", None) or "memory"
    try:
        out = api_publish_dataset(agent_key, path, label=label)
        print("Dataset published.", "ID:", out.get("id"), "| Label:", out.get("label"), "| Size:", out.get("byteSize", 0), "bytes")
        return 0
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 1


def cmd_publish_model(args: argparse.Namespace) -> int:
    try:
        _, agent_key = require_credentials()
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 1
    model_name = getattr(args, "model", None) or MEMORY_UPDATE_MODEL or "gpt-4o"
    try:
        out = api_publish_model(agent_key, model_name=model_name)
        print("Model placeholder published (profile will show LLM in use).", "ID:", out.get("id"), "| Description:", out.get("description", "")[:60])
        return 0
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 1


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="bugcatcher",
        description="Bug-Catcher — LLM agent that plays Pokémon Red and builds a memory dataset.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_register = sub.add_parser("register", help="Register a new Bug-Catcher agent (run once, then add credentials to .env)")
    p_register.set_defaults(func=cmd_register)

    p_start = sub.add_parser("start", help="Start a game session (requires BUG_CATCHER_AGENT_ID and BUG_CATCHER_AGENT_KEY in .env)")
    p_start_sub = p_start.add_subparsers(dest="subcommand", required=True)
    p_new = p_start_sub.add_parser("new", help="Start a new game")
    p_new_game = p_new.add_subparsers(dest="subcommand2", required=True)
    p_game = p_new_game.add_parser("game", help="Start a new game")
    p_game.add_argument("--starter", choices=["bulbasaur", "charmander", "squirtle"], default=None)
    p_game.set_defaults(func=cmd_start_new_game)

    p_load = sub.add_parser("load", help="Load a saved game")
    p_load_sub = p_load.add_subparsers(dest="subcommand", required=True)
    p_last = p_load_sub.add_parser("last", help="Load the most recent save")
    p_last_save = p_last.add_subparsers(dest="subcommand2", required=True)
    p_save = p_last_save.add_parser("save", help="Use the last saved game")
    p_save.set_defaults(func=cmd_load_last_save)

    p_save_cmd = sub.add_parser("save", help="Save the current game to the platform")
    p_save_cmd.add_argument("--label", type=str, default=None, help="Optional label for this save")
    p_save_cmd.set_defaults(func=cmd_save)

    p_stop = sub.add_parser("stop", help="Stop the current session")
    p_stop.set_defaults(func=cmd_stop)

    p_update = sub.add_parser("update-memory", help="Process raw logs into memory dataset (LLM)")
    p_update.add_argument("--run-id", type=str, default=None, help="Process only this run (default: latest)")
    p_update.set_defaults(func=cmd_update_memory)

    p_publish = sub.add_parser("publish", help="Publish to your agent profile (Models & Datasets)")
    p_publish_sub = p_publish.add_subparsers(dest="publish_subcommand", required=True)
    p_pub_ds = p_publish_sub.add_parser("dataset", help="Publish memory_dataset.jsonl so others can see/use your memory")
    p_pub_ds.add_argument("--file", type=str, default=None, help="Path to file (default: bug_catcher_data/memory_dataset.jsonl)")
    p_pub_ds.add_argument("--label", type=str, default="memory", help="Label for the dataset")
    p_pub_ds.set_defaults(func=cmd_publish_dataset)
    p_pub_model = p_publish_sub.add_parser("model", help="Publish a placeholder so profile shows which LLM you use (e.g. GPT-4o)")
    p_pub_model.add_argument("--model", type=str, default=None, help="Model name (default: BUG_CATCHER_MEMORY_MODEL or gpt-4o)")
    p_pub_model.set_defaults(func=cmd_publish_model)

    args = parser.parse_args()
    func = getattr(args, "func", None)
    if func is not None:
        return func(args)
    parser.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
