# Skill: Play Pokémon Red

Use this skill whenever you are in the play loop: you have current state, screen text, short-term steps, and memory, and you must output the next button sequence.

## Inputs

- **State:** mapName, x, y, party size, badges, etc. (from emulator).
- **Screen text:** What appears on screen (dialogue, menu, battle UI).
- **Screenshot (optional):** When vision is enabled, you receive the current game frame (PNG) after each batch of steps. Use it together with state and screen text to recognize menus, dialogue, and the overworld.
- **Short-term:** Last N (state_before, action, state_after, screen_text).
- **Memory:** Long-term facts (locations, NPCs, battles) from the memory dataset.

## Output

A sequence of 1–6 valid actions: `up`, `down`, `left`, `right`, `a`, `b`, `start`, `select`, `pass`.

## Rules

- **Choose how many steps:** Output **1** when you need to see the result (e.g. after dialogue, in menus, in battle). Output **2–6** when you know the path (e.g. walking to a door, navigating a known room).
- **Re-consult after new screen text:** The runner will break and call you again when screen text appears, so you don’t need to guess dialogue or menu outcomes far ahead.
- **Use memory:** Prefer routes and actions that match your stored layout and consequence facts. Avoid repeating failed or irrelevant actions.
- **Valid only:** Reply with nothing but space-separated action words. No explanation in the action reply.

## Tools used

- **Emulator:** step (single action) or actions (sequence). The play loop uses step per action and records each; optional batch tool is `play_game` (run N steps, return final state + screenText).
