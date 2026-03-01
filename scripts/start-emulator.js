#!/usr/bin/env node
/**
 * Start the Pokémon Red emulator service (uvicorn). Uses emulator/.venv if present.
 * Used by `pnpm dev` so the app and emulator start together.
 */
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const emulatorDir = path.join(root, "emulator");
const isWin = process.platform === "win32";
const venvUvicorn = isWin
  ? path.join(emulatorDir, ".venv", "Scripts", "uvicorn.exe")
  : path.join(emulatorDir, ".venv", "bin", "uvicorn");

const uvicorn = fs.existsSync(venvUvicorn) ? venvUvicorn : "uvicorn";

const child = spawn(
  uvicorn,
  ["server:app", "--host", "0.0.0.0", "--port", "8765"],
  {
    cwd: emulatorDir,
    stdio: "inherit",
    shell: isWin,
  }
);

child.on("error", (err) => {
  console.error("Emulator failed to start:", err.message);
  if (uvicorn === "uvicorn") {
    console.error("Tip: run from emulator/ with a venv: cd emulator && pip install -r requirements.txt && uvicorn server:app --port 8765");
  }
  process.exit(1);
});
child.on("exit", (code) => {
  process.exit(code ?? 0);
});
