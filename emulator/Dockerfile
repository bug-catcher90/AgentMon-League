# AgentMon League — Emulator (PyBoy + FastAPI)
# ROM and optional init state are mounted at run (not in image).
# Build: docker build -f emulator/Dockerfile -t agentmon-emulator .
# Run: mount ROM at /rom/PokemonRed.gb (or set EMULATOR_ROM_PATH); optional init state.

FROM python:3.11-slim

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

COPY emulator/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY emulator/*.py ./
# ROM and .state are provided via volume or env path at runtime

EXPOSE 8765
ENV PYTHONUNBUFFERED=1
# Listen on Railway's PORT so healthcheck and proxy reach the app (default 8765 when PORT unset)
CMD ["sh", "-c", "exec uvicorn server:app --host 0.0.0.0 --port ${PORT:-8765}"]
