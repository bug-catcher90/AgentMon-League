"""Process raw step log with LLM into structured memory dataset entries."""

import json
import os
import sys
from pathlib import Path

from openai import OpenAI

from bug_catcher.config import (
    MEMORY_DATASET_PATH,
    MEMORY_UPDATE_MAX_ENTRIES,
    MEMORY_UPDATE_MODEL,
    RAW_LOGS_DIR,
)
from bug_catcher.storage import append_memory_entries, read_raw_log


def run_memory_update(
    run_id: str | None = None,
    paths: list[Path] | None = None,
    max_entries: int = 0,
) -> int:
    """
    Load raw log(s), ask LLM to extract facts (locations, layout, NPCs, battles),
    append new entries to memory_dataset.jsonl. Returns number of entries added.
    """
    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
    max_entries = max_entries or MEMORY_UPDATE_MAX_ENTRIES

    if paths:
        files = paths
    elif run_id:
        p = RAW_LOGS_DIR / f"run_{run_id}.jsonl"
        if not p.exists():
            raise FileNotFoundError(f"Raw log not found: {p}")
        files = [p]
    else:
        files = sorted(RAW_LOGS_DIR.glob("run_*.jsonl"), key=lambda x: x.stat().st_mtime, reverse=True)
        if not files:
            print("No raw logs found. Play first to generate data.", file=sys.stderr)
            return 0
        files = files[:3]

    all_steps: list[dict] = []
    for p in files:
        for rec in read_raw_log(p):
            all_steps.append(rec)
    if not all_steps:
        print("No steps in selected logs.", file=sys.stderr)
        return 0

    sample = all_steps[-min(150, len(all_steps)):]
    text_blob = json.dumps(sample, ensure_ascii=False, indent=0)[:80000]

    prompt = f"""You are summarizing a Pokémon Red play session into a compact memory for future games. Below are step records: stateBefore (mapName, x, y, partySize, etc.), action, stateAfter, screenText.

Extract durable facts the agent should remember, such as:
- Location layout: "Oak's Lab: wall 3 steps north, exit south, 1 NPC (Oak), 1 trainer."
- Consequences: "Pressing A in front of Oak started dialogue." "In battle, Ember was critical hit on Bulbasaur."
- Map connectivity: "From Pallet Town north leads to Route 1."
- Items/NPCs: "PC in corner at (x,y)." "Healer in Pokémon Center."

Output a JSON array of objects, each with "type" (e.g. "location", "battle", "npc", "layout", "consequence") and "content" (one short sentence). No duplicates. Maximum {max_entries} entries. Only include facts that are clearly supported by the data.

Raw steps (excerpt):
{text_blob}

Reply with only the JSON array, no other text."""

    response = client.chat.completions.create(
        model=MEMORY_UPDATE_MODEL,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=4000,
    )
    raw = (response.choices[0].message.content or "").strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        entries = json.loads(raw)
    except json.JSONDecodeError:
        print("LLM did not return valid JSON; skipping memory update.", file=sys.stderr)
        return 0
    if not isinstance(entries, list):
        entries = [entries] if isinstance(entries, dict) else []
    out = []
    seen: set[str] = set()
    existing = set()
    if MEMORY_DATASET_PATH.exists():
        with open(MEMORY_DATASET_PATH, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        e = json.loads(line)
                        existing.add(e.get("content", "").strip())
                    except Exception:
                        pass
    for e in entries:
        if not isinstance(e, dict):
            continue
        content = (e.get("content") or "").strip()
        if not content or content in existing or content in seen:
            continue
        seen.add(content)
        out.append({"type": e.get("type", "fact"), "content": content})
    if out:
        append_memory_entries(out)
    return len(out)
