"""Gymnasium env that wraps the AgentMon League API. One episode = one session."""

import base64
import time

import numpy as np
import requests
from gymnasium import Env, spaces

from rl_agent.api_client import (
    get_frame,
    get_state,
    run_action,
    start_session,
    stop_session,
)
from rl_agent.config import EPISODE_MAX_STEPS
from rl_agent.obs_reward import (
    COORDS_PAD,
    ENC_FREQS,
    EVENT_FLAGS_END,
    EVENT_FLAGS_START,
    OUTPUT_SHAPE,
    V2_ACTION_NAMES,
    build_obs_from_frame_and_state,
    compute_reward,
)


class EmulatorEnv(Env):
    """
    One episode = one game session. reset() starts a new session and returns first obs.
    step(a) sends action to API, returns (obs, reward, terminated, truncated, info).

    Use starter for new game, load_session_id for load last save.
    """

    def __init__(
        self,
        agent_id: str,
        agent_key: str,
        *,
        starter: str | None = None,
        load_session_id: str | None = None,
        episode_max_steps: int | None = None,
    ):
        super().__init__()
        self.agent_id = agent_id
        self.agent_key = agent_key
        self.starter = starter
        self.load_session_id = load_session_id
        self._episode_max_steps = episode_max_steps if episode_max_steps is not None else EPISODE_MAX_STEPS
        self._session_agent_id: str | None = None  # set in reset from start_session response
        self.observation_space = spaces.Dict({
            "screens": spaces.Box(low=0, high=255, shape=OUTPUT_SHAPE, dtype=np.uint8),
            "health": spaces.Box(low=0, high=1, shape=(1,), dtype=np.float32),
            "level": spaces.Box(low=-1, high=1, shape=(ENC_FREQS,), dtype=np.float32),
            "badges": spaces.MultiBinary(8),
            "events": spaces.MultiBinary((EVENT_FLAGS_END - EVENT_FLAGS_START) * 8),
            "map": spaces.Box(low=0, high=255, shape=(COORDS_PAD * 4, COORDS_PAD * 4, 1), dtype=np.uint8),
            "recent_actions": spaces.MultiDiscrete([len(V2_ACTION_NAMES)] * 3),
        })
        self.action_space = spaces.Discrete(len(V2_ACTION_NAMES))
        self._recent_screens = np.zeros(OUTPUT_SHAPE, dtype=np.uint8)
        self._recent_actions = np.zeros(3, dtype=np.int8)
        self._step = 0
        self._state_before: dict = {}

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        # End previous session so each episode is a fresh game (emulator only allows one session per agent)
        try:
            stop_session(self.agent_key)
        except Exception:
            pass
        if self.load_session_id:
            start_data = start_session(self.agent_key, load_session_id=self.load_session_id)
        else:
            start_data = start_session(self.agent_key, starter=self.starter)
        # Use agentId from start response (correct after DB reset when .env has stale AGENT_ID)
        self._session_agent_id = start_data.get("agentId") or self.agent_id
        self._step = 0
        self._recent_screens = np.zeros(OUTPUT_SHAPE, dtype=np.uint8)
        self._recent_actions = np.zeros(3, dtype=np.int8)
        state = get_state(self.agent_key) or {}
        self._state_before = state
        # Retry get_frame: emulator may return 404 briefly after start_session
        frame_bytes = None
        for attempt in range(15):
            try:
                frame_bytes = get_frame(self._session_agent_id)
                break
            except requests.exceptions.HTTPError as e:
                if e.response is not None and e.response.status_code == 404 and attempt < 14:
                    time.sleep(0.5)
                    continue
                raise
        if frame_bytes is None:
            raise RuntimeError("Could not get frame after start. Is the emulator running?")
        obs = build_obs_from_frame_and_state(
            frame_bytes, state, self._recent_screens, self._recent_actions
        )
        self._recent_screens = obs["screens"].copy()
        return obs, {"state": state}

    def step(self, action: int):
        if action < 0 or action >= len(V2_ACTION_NAMES):
            action = 0
        action_name = V2_ACTION_NAMES[action]
        self._recent_actions = np.roll(self._recent_actions, 1)
        self._recent_actions[0] = action

        result = run_action(self.agent_key, action_name)
        state_after = result.get("state") or {}
        self._step += 1

        reward = compute_reward(self._state_before, state_after, step_penalty=True)
        self._state_before = state_after

        agent_id = self._session_agent_id or self.agent_id
        # Use frame from actions response when present (saves one round-trip in prod).
        b64 = result.get("frameBase64")
        if b64:
            frame_bytes = base64.b64decode(b64)
        else:
            frame_bytes = get_frame(agent_id)
        obs = build_obs_from_frame_and_state(
            frame_bytes, state_after, self._recent_screens, self._recent_actions
        )
        self._recent_screens = obs["screens"].copy()

        terminated = False
        truncated = self._step >= self._episode_max_steps
        info = {"state": state_after, "step": self._step}
        return obs, float(reward), terminated, truncated, info
