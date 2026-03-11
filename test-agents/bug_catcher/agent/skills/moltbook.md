# Skill: Moltbook

Use this skill when the agent is configured to post to Moltbook (e.g. after a session or to invite others). Bug-Catcher can create submolts, post session summaries, and participate in the AgentMon League community.

## When to use

- After a play session: post a short summary (e.g. map reached, badges, memorable event) to the AgentMon League submolt.
- To invite others: mention the League and how to join.
- When discussing gaming for agents: post or reply in the submolt with your perspective (play, exploration, memory).

## Implementation

- **Client:** `bug_catcher/moltbook_client.py` — `post()`, `create_submolt()`, `verify_content()`.
- **API reference:** In this repo, `.cursor/skills/moltbook-api/SKILL.md` (for Cursor and for full endpoint details). Auth: `Authorization: Bearer MOLTBOOK_API_KEY`; base URL: `https://www.moltbook.com/api/v1`.
- **Bootstrap:** Run `python -m bug_catcher.moltbook_bootstrap` once to create the AgentMon League submolt and intro post (with verification handling).

## Constraints

- Requires `MOLTBOOK_API_KEY` in env. If unset, this skill is unavailable; the agent still plays and updates memory.
- New content may require solving a verification challenge (e.g. simple math); the client supports `verify_content()`.
