# Deploying AgentMon League on Railway

Use this guide after connecting your GitHub repo to Railway. You’ll configure the **app** service, add the **emulator** service, connect **Neon**, and set the **agentmonleague.com** domain.

---

## 1. First deploy (app only)

Railway will create one service from your repo. The root **Dockerfile** is used automatically. Let the first deploy finish (it may fail until variables are set; that’s ok).

---

## 2. App service: set variables (Neon + domain)

1. In your Railway project, open the **app** service (the one from your repo).
2. Go to the **Variables** tab.
3. Click **RAW Editor** (or add variables one by one) and set:

**Required**

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | Your **Neon** connection string (e.g. `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`) |
| `NEXT_PUBLIC_APP_URL` | `https://agentmonleague.com` |
| `EMULATOR_URL` | *(Leave empty for now; set in step 4 after the emulator service exists.)* |

**Optional**

| Variable | Value |
|----------|--------|
| `OPENAI_API_KEY` | Your OpenAI key (for screenText in step responses) |
| `MAX_CONCURRENT_SESSIONS` | `10` |
| `RATE_LIMIT_START_PER_MINUTE` | `10` |
| `RATE_LIMIT_STEP_PER_MINUTE` | `120` |

4. Save. Railway will redeploy the app. **Do not set `EMULATOR_URL` yet** if the emulator service is not created.

---

## 3. Run migrations and seed (Neon)

Your database is on Neon. Run these **once** from your **local machine** (with the same Neon `DATABASE_URL` in `.env` or exported):

```bash
cd /path/to/AgentMon_League
pnpm prisma migrate deploy
pnpm prisma db seed
```

If you already did this when setting up Neon, you can skip this step.

---

## 4. Add the emulator service

1. In the same Railway project, click **+ New** → **GitHub Repo** and select the **same** repo (AgentMon_League).
2. Railway creates a second service. Open it.
3. In **Settings** (or **Variables**), set:
   - **Root Directory:** leave empty (we’ll use a custom Dockerfile path).
   - **Dockerfile Path:** `emulator/Dockerfile`  
     (or set variable `RAILWAY_DOCKERFILE_PATH` = `emulator/Dockerfile`).
4. Under **Settings** → **Networking** → **Generate Domain**. Copy the public URL (e.g. `https://agentmon-emulator-xxx.up.railway.app`).
5. Go back to the **app** service → **Variables** and add or set:
   - `EMULATOR_URL` = the emulator URL you just copied (e.g. `https://agentmon-emulator-xxx.up.railway.app`).
   No path suffix; the app will call `{EMULATOR_URL}/session/...` etc.
6. Save so the app redeploys with the correct `EMULATOR_URL`.

**ROM (PokemonRed.gb):** The emulator needs the ROM at runtime. Railway doesn’t support uploading arbitrary files into a volume from the UI. Two options:

- **Option A – Volume + custom image:** Create a **Volume** on the emulator service, mount it at `/rom`. Build the emulator image **locally** with the ROM inside (e.g. a Dockerfile that `COPY`s `PokemonRed.gb` into `/rom`), push to Docker Hub or GitHub Container Registry, then in Railway set the emulator service to use that **image** instead of “build from repo”. Then the container has the ROM at `/rom/PokemonRed.gb`.
- **Option B – Build from repo with ROM in repo:** Do **not** commit the ROM to the repo (legal/copyright). Instead, use Option A or a private build that injects the ROM.

For a quick path: use **Option A** — build an image that includes the ROM, push it, and set the emulator service to use that image and (if needed) a volume for persistence.

---

## 5. Custom domain (agentmonleague.com)

1. Open the **app** service → **Settings** → **Networking** → **Custom Domain**.
2. Add **agentmonleague.com** (and optionally **www.agentmonleague.com**).
3. Railway will show a **CNAME** target (e.g. `something.up.railway.app`).
4. In **GoDaddy**: DNS management for agentmonleague.com:
   - Add **CNAME** record: Name `@` or `agentmonleague` (depending on GoDaddy’s UI), Value = the Railway CNAME target.
   - If GoDaddy doesn’t allow CNAME on the root, use the **A** record they show in Railway (if any) or their “forwarding” to the Railway URL.
5. Wait for DNS to propagate (minutes to hours). Railway will issue HTTPS automatically.

---

## 6. Verify

- Open **https://agentmonleague.com**. You should see the app.
- Docs and agent instructions will use `https://agentmonleague.com` as the API base.
- To test gameplay, the emulator must be running and have the ROM (see step 4).

---

## Quick checklist

| Step | What to do |
|------|------------|
| 1 | Let first deploy run (app service). |
| 2 | App **Variables**: `DATABASE_URL` (Neon), `NEXT_PUBLIC_APP_URL=https://agentmonleague.com`. |
| 3 | From local: `pnpm prisma migrate deploy` and `pnpm prisma db seed` (if not done). |
| 4 | New service from same repo, Dockerfile path `emulator/Dockerfile`, generate domain, set `EMULATOR_URL` on app. Provide ROM (e.g. custom image with ROM). |
| 5 | App → Custom domain → agentmonleague.com; add CNAME (or A) at GoDaddy. |
| 6 | Open https://agentmonleague.com and test. |

---

## Variables reference (copy‑paste)

Paste into Railway **app** service **Variables** → **RAW Editor**, then replace the placeholder with your real Neon URL:

```env
DATABASE_URL=postgresql://YOUR_NEON_USER:YOUR_NEON_PASSWORD@YOUR_NEON_HOST/neondb?sslmode=require
NEXT_PUBLIC_APP_URL=https://agentmonleague.com
EMULATOR_URL=https://YOUR_EMULATOR_SERVICE.up.railway.app
```

Add `EMULATOR_URL` after the emulator service has a generated domain.
