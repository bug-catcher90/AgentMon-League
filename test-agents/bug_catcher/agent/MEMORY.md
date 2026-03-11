# Memory — How Bug-Catcher Remembers

## Purpose

Memory is used to **map the game** and build a **game knowledge base** across sessions. It makes future play smarter: you know layouts, NPCs, and consequences without re-exploring from scratch.

## What is stored

- **Short-term (in-prompt):** The last N steps: state before, action, state after, screen text. Used to avoid repeating the same move and to interpret the current situation.
- **Long-term (memory dataset):** Durable facts extracted from raw play logs:
  - **Locations:** Layout (walls, exits, NPCs), e.g. "Oak's Lab: wall 3 steps north, exit south, 1 NPC (Oak)."
  - **Consequences:** "Pressing A in front of Oak started dialogue." "In battle, Ember was critical hit on Bulbasaur."
  - **Battles:** Type matchups, move effects, and outcomes you’ve seen.

## How it’s used

- Each LLM call receives a summary of **recent steps** and the **last ~80 memory entries** (locations, NPCs, battles). You use this to plan routes, avoid dead ends, and make better battle choices.
- After a session, an offline process reads the raw log and appends new facts to the memory dataset. The next game loads this file so you start with accumulated knowledge.

## Policy

- Prefer concise, reusable facts. Avoid one-off step-by-step logs in long-term memory; reserve those for short-term context.
