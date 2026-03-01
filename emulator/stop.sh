#!/bin/sh
# Stop the emulator server on port 8765 (so you can start a fresh one).
PID=$(lsof -i :8765 -t 2>/dev/null)
if [ -n "$PID" ]; then
  kill "$PID"
  echo "Stopped emulator (PID $PID). You can start it again with: uvicorn server:app --host 0.0.0.0 --port 8765"
else
  echo "No process is using port 8765."
fi
