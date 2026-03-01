"""Play loop: state + screenText + memory. One LLM call can return multiple actions; we run them until screen text appears or queue empty (saves API cost)."""

import os
import sys
import time
from collections import deque
from typing import Any

from openai import OpenAI

from bug_catcher.api_client import (
    check_session_ready,
    get_state,
    save_session as api_save_session,
    step as api_step,
    stop_session as api_stop_session,
)
from bug_catcher.config import (
    MAX_ACTIONS_PER_CALL,
    MEMORY_UPDATE_MODEL,
    MAX_STEPS_PER_SESSION,
    SAVE_EVERY_STEPS,
    SHORT_TERM_LEN,
    STEP_INTERVAL,
)
from bug_catcher.llm import choose_action
from bug_catcher.storage import append_raw_step, load_memory_dataset, raw_log_path


def run_play_loop(
    agent_id: str,
    agent_key: str,
    run_id: str,
    *,
    on_exit_stop: bool = True,
    on_exit_save: bool = True,
    on_exit_update_memory: bool = True,
    step_interval: float | None = None,
) -> int:
    """
    Play until KeyboardInterrupt or max_steps. Records every step to raw log.
    On exit: stop session, optionally save game and run memory update.
    Returns total steps.
    """
    from bug_catcher.memory_update import run_memory_update

    interval = step_interval if step_interval is not None else STEP_INTERVAL
    max_steps = MAX_STEPS_PER_SESSION if MAX_STEPS_PER_SESSION > 0 else 0
    save_every = SAVE_EVERY_STEPS if SAVE_EVERY_STEPS > 0 else 0

    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
    memory_entries = load_memory_dataset()
    short_term: deque = deque(maxlen=SHORT_TERM_LEN)
    current_state: dict[str, Any] = get_state(agent_key) or {}
    screen_text = ""
    step_index = 0

    try:
        while True:
            if max_steps > 0 and step_index >= max_steps:
                print(f"Reached max steps {max_steps}. Stopping.")
                break
            # One LLM call can return multiple actions; we run them until screen text appears or queue empty
            chosen = choose_action(
                client,
                current_state,
                screen_text,
                short_term,
                memory_entries,
                model=MEMORY_UPDATE_MODEL,
            )
            action_queue = (chosen or ["pass"])[:MAX_ACTIONS_PER_CALL]
            for action in action_queue:
                if max_steps > 0 and step_index >= max_steps:
                    break
                state_before = dict(current_state)
                try:
                    result = api_step(agent_key, action)
                except Exception as e:
                    print(f"Step error: {e}", file=sys.stderr)
                    time.sleep(2)
                    break
                state_after = result.get("state") or {}
                screen_text = (result.get("screenText") or "").strip()
                current_state = state_after
                record = {
                    "stepIndex": step_index,
                    "stateBefore": state_before,
                    "action": action,
                    "stateAfter": state_after,
                    "screenText": screen_text,
                    "feedback": result.get("feedback"),
                }
                append_raw_step(run_id, record)
                short_term.append((state_before, action, state_after, screen_text))
                step_index += 1

                if save_every > 0 and step_index % save_every == 0:
                    try:
                        api_save_session(agent_key, label=f"auto_step_{step_index}")
                        print(f"  Auto-saved game at step {step_index}.")
                    except Exception as e:
                        print(f"  Auto-save failed: {e}", file=sys.stderr)

                if step_index % 5 == 0:
                    loc = current_state.get("mapName", "?")
                    print(f"  Steps: {step_index} | {loc} | last: {action}")

                time.sleep(interval)
                # Re-consult LLM when something appears on screen (dialogue, menu, battle)
                if screen_text:
                    break
    except KeyboardInterrupt:
        pass

    # Exit order: save (while session active) → stop → update memory
    if on_exit_save and step_index > 0:
        try:
            api_save_session(agent_key, label=f"after_{step_index}_steps")
            print("Game saved on platform.")
        except Exception as e:
            print(f"Save error: {e}", file=sys.stderr)
    if on_exit_stop:
        try:
            api_stop_session(agent_key)
            print("Session stopped.")
        except Exception as e:
            print(f"Stop session error: {e}", file=sys.stderr)
    if on_exit_update_memory and raw_log_path(run_id).exists():
        print("Updating memory dataset from raw log...")
        try:
            run_memory_update(run_id=run_id)
        except Exception as e:
            print(f"Memory update error: {e}", file=sys.stderr)

    return step_index
