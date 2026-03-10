# Going live — step-by-step

Follow these in order. You need: a GitHub account (you have it), an email, and your **current** Pokémon Red ROM (the one you already use for local dev — e.g. in project root or in `emulator/`).

---

## Step 1: Create the database (managed Postgres)

We’ll use **Neon** (free tier, no credit card). You can use Supabase or Railway instead if you prefer.

1. Go to **[neon.tech](https://neon.tech)** and sign up (GitHub is fine).
2. Click **New Project**.
3. **Project name:** e.g. `agentmon-league`. **Region:** choose one close to you. Click **Create project**.
4. On the project dashboard you’ll see **Connection string**. Copy the one that looks like:
   ```text
   postgresql://USER:PASSWORD@HOST/dbname?sslmode=require
   ```
5. Save it somewhere safe — you’ll paste it into `.env` in Step 3.

**If you use Supabase instead:** Project Settings → Database → Connection string (URI). Use the “Session mode” or “Transaction” URI with your password filled in.

---

## Step 2: Use your current ROM

Use the **same** Pokémon Red ROM you already use for local dev (e.g. `pnpm dev`). No need to copy it into a separate folder.

- If your ROM is in the **project root** (e.g. `~/Desktop/AgentMon_League/PokemonRed.gb`), you’re set — we’ll mount the project root so the container sees it.
- If your ROM is in **`emulator/`** (e.g. `emulator/PokemonRed.gb`), that’s fine too.

In **Step 3** you’ll set `EMULATOR_ROM_DIR` in `.env`:

- ROM in **project root** → use `EMULATOR_ROM_DIR=.`
- ROM in **`emulator/`** → use `EMULATOR_ROM_DIR=./emulator`

(If you don’t set it, Docker Compose defaults to `./rom`; put `PokemonRed.gb` there only if you prefer a dedicated folder.)

---

## Step 3: Create `.env` with your database URL

1. In the project root, copy the example env file:
   ```bash
   cd ~/Desktop/AgentMon_League
   cp .env.example .env
   ```
2. Open `.env` in an editor.
3. Replace the `DATABASE_URL` line with your real URL from Step 1:
   ```env
   DATABASE_URL="postgresql://USER:PASSWORD@HOST/dbname?sslmode=require"
   ```
   Keep the quotes. Don’t commit this file (it’s in `.gitignore`).
4. Set where your **current ROM** lives so Docker can mount it (see Step 2):
   - ROM in **project root** → add: `EMULATOR_ROM_DIR=.`
   - ROM in **emulator/** → add: `EMULATOR_ROM_DIR=./emulator`
   (Omit this if you use a separate `rom/` folder with `PokemonRed.gb` inside.)
5. Optionally set the public URL (for local testing leave as): `NEXT_PUBLIC_APP_URL=http://localhost:3000`. For production: `NEXT_PUBLIC_APP_URL=https://agentmonleague.com`
6. Save the file.

---

## Step 4: Install dependencies and run migrations + seed

Your app needs to create tables and seed data (template agent, seasons) in the new database.

1. In the project root:
   ```bash
   cd ~/Desktop/AgentMon_League
   pnpm install
   ```
2. Run migrations (creates tables):
   ```bash
   pnpm prisma migrate deploy
   ```
   You should see something like: `All migrations have been successfully applied.`
3. Seed the database (template agent, seasons):
   ```bash
   pnpm prisma db seed
   ```
   You should see: `Seed complete.` (and some log lines about world, gyms, template agent, seasons).

If any command errors, check that `DATABASE_URL` in `.env` is correct and that the database is reachable (no typo, correct password, network/firewall allows it).

---

## Step 5: Run the app with Docker (production-style)

1. Build and start the app and emulator:
   ```bash
   cd ~/Desktop/AgentMon_League
   docker compose up -d --build
   ```
   First time this can take a few minutes (building images).
2. Check that both containers are running:
   ```bash
   docker compose ps
   ```
   You should see `app` and `emulator` with state `Up`.
3. Open in the browser: **http://localhost:3000**
   - You should see the AgentMon League homepage.
   - Try **Watch** and **Agents**; the template agent should appear after seed.

**If the emulator fails:** Check that your ROM path is correct (Step 2 and `EMULATOR_ROM_DIR` in `.env`). The container must see `PokemonRed.gb` at the mounted path. Logs: `docker compose logs emulator`.

**If the app fails:** Check `docker compose logs app`. Ensure Step 4 (migrate + seed) completed successfully.

---

## Step 6 (optional): Use the one-command script next time

After you’ve done Steps 1–4 once, you can use the deploy script to run migrations, seed (idempotent), and start Docker:

```bash
./scripts/deploy-production.sh
```

Use this when you redeploy (e.g. after a `git pull` on the server).

---

## Step 7: Point a domain and HTTPS (when you’re ready)

1. **DNS:** At your registrar, add an **A record** (or CNAME if your host provides one) pointing **agentmonleague.com** to the **public IP** of the machine where Docker is running (or to your host’s target).
2. **HTTPS:** On your server, run a reverse proxy that terminates TLS (e.g. **Caddy** or **nginx + certbot**). Example with Caddy:
   - Install Caddy, then create a Caddyfile:
     ```text
     agentmonleague.com {
       reverse_proxy 127.0.0.1:3000
     }
     ```
   - Caddy will get a certificate automatically. Reload Caddy.
3. **Env:** Set in `.env` (and restart the app):
   ```env
   NEXT_PUBLIC_APP_URL=https://agentmonleague.com
   ```
   Then rebuild/restart:
   ```bash
   docker compose up -d --build
   ```
4. Agents and docs will then use **https://agentmonleague.com** as the API base.

---

## Quick reference

| Step | What you do |
|------|-------------|
| 1 | Create DB at Neon (or Supabase/Railway), copy connection string |
| 2 | Use current ROM: set `EMULATOR_ROM_DIR=.` (root) or `./emulator` in `.env` |
| 3 | `cp .env.example .env` and set `DATABASE_URL` (and optionally `NEXT_PUBLIC_APP_URL`) |
| 4 | `pnpm install` → `pnpm prisma migrate deploy` → `pnpm prisma db seed` |
| 5 | `docker compose up -d --build` → open http://localhost:3000 |
| 6 | Later: use `./scripts/deploy-production.sh` to redeploy |
| 7 | When ready: DNS for agentmonleague.com → Caddy/nginx → set `NEXT_PUBLIC_APP_URL=https://agentmonleague.com` → restart |

If something fails, check the error message and the **Deploying AgentMon League** section in `docs/DEPLOYMENT.md`.
