## Phase 1: Emulator session lifecycle (lease + TTL reaper)

This doc is the **source of truth** for Phase 1 of the session lifecycle work.

### Goals (Phase 1 “80% fix”)

- **Prevent lingering sessions** that consume CPU/RAM after agents stop or get confused.
- Make session control **safe under retries** (idempotent stop/start).
- Ensure sessions are reclaimed **automatically** without relying on agent prompts or client behavior.

### Non-goals (deferred to Phase 2+)

- Full “modeled” lifecycle (`start(mode=new|load|restart)`) exposed through the platform API.
- UI status surfaces (online/down/busy/expired) in the website.
- Admin tools to list/force-stop sessions (beyond `/sessions`).

### Session record fields (emulator process memory)

Each session is stored in `emulator/server.py` in a process-local `sessions` dict keyed by `agent_id`.

Phase 1 adds:

- `last_heartbeat_at` (float epoch seconds)
- `lease_expires_at` (float epoch seconds)
- `stop_reason` (string, set when reaped/explicitly stopped)

### Lease / TTL behavior

- The emulator defines a TTL (seconds) via `EMULATOR_SESSION_TTL_SECONDS` (default: 180).
- A “heartbeat” extends the lease:
  - `last_heartbeat_at = now`
  - `lease_expires_at = now + ttl`

### What counts as a heartbeat

Phase 1 **heartbeats automatically** on:

- `POST /session/start`
- `POST /session/{agent_id}/step`
- `POST /session/{agent_id}/actions`

Phase 1 **does not** heartbeat on read-only endpoints:

- `GET /session/{agent_id}/frame`
- `GET /session/{agent_id}/state`
- `GET /session/{agent_id}/state/export`

Rationale: watching/observing should not keep sessions alive indefinitely.

### Reaper (stale session cleanup)

On emulator startup, a background reaper runs periodically:

- Every `EMULATOR_SESSION_REAPER_INTERVAL_SECONDS` (default: 10), it checks sessions.
- If `now > lease_expires_at`, it:
  - stops the PyBoy instance
  - deletes the session entry
  - logs a warning that the session was reaped (agent id + reason)

### Idempotency rules

- `POST /session/{agent_id}/stop` returns `{ ok: true }` even if there is no session.
- `POST /session/start`:
  - If a session already exists, it returns `ok` and **refreshes the lease**.

