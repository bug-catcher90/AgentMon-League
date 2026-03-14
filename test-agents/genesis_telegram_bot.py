#!/usr/bin/env python3
"""
AgentMon Genesis Telegram bot — run Genesis commands from your phone.

  /start     — show help
  /newgame   — start new game (optional: bulbasaur, charmander, squirtle)
  /load      — load last save
  /save      — save current game (optional label)
  /stop      — stop current session
  /status    — whether a play session is running

Requires TELEGRAM_BOT_TOKEN in test-agents/.env (create a bot via @BotFather).
Uses the same AGENT_ID, AGENT_KEY, APP_URL as agentmongenesis.
"""

import asyncio
import os
import subprocess
import sys
from pathlib import Path

# Load test-agents/.env before importing rl_agent
_here = Path(__file__).resolve().parent
if str(_here) not in sys.path:
    sys.path.insert(0, str(_here))
_env = _here / ".env"
if _env.exists():
    from dotenv import load_dotenv
    load_dotenv(_env)

from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
)

from rl_agent.api_client import ensure_agent, list_saves, save_session as api_save_session, stop_session
from rl_agent.config import APP_URL

# Subprocess for long-running play (start new game / load last save). None when idle.
_play_process: subprocess.Popen | None = None


def _play_running() -> bool:
    global _play_process
    if _play_process is None:
        return False
    if _play_process.poll() is not None:
        _play_process = None
        return False
    return True


def _subprocess_env() -> dict:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(_here) + (os.pathsep + env.get("PYTHONPATH", "")) if env.get("PYTHONPATH") else str(_here)
    return env


def _run_genesis_start_new_game(starter: str | None) -> subprocess.Popen:
    """Start agentmongenesis start new game in background. Returns the Popen."""
    cmd = [sys.executable, "-m", "agentmongenesis_cli", "start", "new", "game"]
    if starter and starter.lower() in ("bulbasaur", "charmander", "squirtle"):
        cmd.extend(["--starter", starter.lower()])
    return subprocess.Popen(
        cmd,
        cwd=str(_here),
        env=_subprocess_env(),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )


def _run_genesis_load_last_save() -> subprocess.Popen:
    """Start agentmongenesis load last save in background. Returns the Popen."""
    cmd = [sys.executable, "-m", "agentmongenesis_cli", "load", "last", "save"]
    return subprocess.Popen(
        cmd,
        cwd=str(_here),
        env=_subprocess_env(),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    watch_url = f"{APP_URL}/observe/watch"
    text = (
        "🟢 *AgentMon Genesis* — control the RL agent from Telegram.\n\n"
        "*Commands:*\n"
        "• /newgame [bulbasaur|charmander|squirtle] — start a new game\n"
        "• /load — load last save\n"
        "• /save [label] — save current game\n"
        "• /stop — stop current session\n"
        "• /status — check if a session is running\n\n"
        f"Watch live: {watch_url}"
    )
    await update.message.reply_text(text, parse_mode="Markdown")


async def cmd_newgame(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    global _play_process
    if _play_running():
        await update.message.reply_text("⚠️ A game is already running. Use /stop first, or watch the current session.")
        return
    starter = (context.args[0].strip().lower() if context.args else None) or None
    if starter and starter not in ("bulbasaur", "charmander", "squirtle"):
        await update.message.reply_text("Starter must be bulbasaur, charmander, or squirtle. Starting without starter choice.")
        starter = None
    try:
        ensure_agent()
    except RuntimeError as e:
        await update.message.reply_text(f"❌ {e}")
        return
    _play_process = _run_genesis_start_new_game(starter)
    watch_url = f"{APP_URL}/observe/watch"
    msg = f"✅ New game started." + (f" Starter: {starter}." if starter else "")
    await update.message.reply_text(f"{msg}\n\nWatch: {watch_url}")


async def cmd_load(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    global _play_process
    if _play_running():
        await update.message.reply_text("⚠️ A game is already running. Use /stop first.")
        return
    try:
        agent_id, agent_key = ensure_agent()
        saves = list_saves(agent_key)
    except RuntimeError as e:
        await update.message.reply_text(f"❌ {e}")
        return
    if not saves:
        await update.message.reply_text(
            "No saved games. Use /newgame, play, then /stop (game is saved on exit). Then you can /load."
        )
        return
    _play_process = _run_genesis_load_last_save()
    watch_url = f"{APP_URL}/observe/watch"
    await update.message.reply_text(f"✅ Loaded last save.\n\nWatch: {watch_url}")


async def cmd_save(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    label = " ".join(context.args).strip() if context.args else None
    try:
        _, agent_key = ensure_agent()
        data = api_save_session(agent_key, label=label or None)
        save_id = data.get("saveId", "—")
        lbl = (data.get("label") or label or "").strip()
        msg = f"✅ Game saved. Save ID: {save_id}" + (f" — {lbl}" if lbl else "")
        await update.message.reply_text(msg)
    except RuntimeError as e:
        await update.message.reply_text(f"❌ {e}")


async def cmd_stop(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        _, agent_key = ensure_agent()
        stop_session(agent_key)
    except RuntimeError as e:
        await update.message.reply_text(f"❌ {e}")
        return
    global _play_process
    if _play_process is not None and _play_process.poll() is None:
        _play_process.terminate()
        _play_process = None
    await update.message.reply_text("✅ Session stopped. Playtime recorded.")


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if _play_running():
        await update.message.reply_text("🟢 A play session is running. Watch: " + f"{APP_URL}/observe/watch")
    else:
        await update.message.reply_text("⚪ No play session running. Use /newgame or /load to start.")


def main() -> int:
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        print("Set TELEGRAM_BOT_TOKEN in test-agents/.env (create a bot via @BotFather).", file=sys.stderr)
        return 1
    app = Application.builder().token(token).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("newgame", cmd_newgame))
    app.add_handler(CommandHandler("load", cmd_load))
    app.add_handler(CommandHandler("save", cmd_save))
    app.add_handler(CommandHandler("stop", cmd_stop))
    app.add_handler(CommandHandler("status", cmd_status))
    print("Genesis Telegram bot running. Send /start to your bot.")
    app.run_polling(allowed_updates=Update.ALL_TYPES)
    return 0


if __name__ == "__main__":
    sys.exit(main())
