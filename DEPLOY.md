# Deploying the demo (free)

Two free services:

| Part | Host | URL shape | Notes |
|------|------|-----------|-------|
| Frontend (Next.js) | **Vercel** | `your-app.vercel.app` | Instant, no cold start. This is the link you share. |
| Backend (FastAPI + LangChain + ChromaDB) | **Render** | `modulhandbuch-backend.onrender.com` | Free tier sleeps after ~15 min idle → first request then waits ~50 s. |

The backend builds its own vector store from the bundled PDF on first boot
(`app.rag.ensure_ingested`), so there is nothing to upload. That one-time
ingestion costs a fraction of a cent in OpenAI embeddings and adds ~40 s to
the first startup only.

---

## 0. OpenAI: cap the spend first

1. <https://platform.openai.com/settings/organization/limits> → set a low
   **monthly budget** (e.g. $5).
2. <https://platform.openai.com/settings/organization/billing/overview> →
   make sure **auto‑recharge is OFF**. With it off, you can never be billed
   past the credit already on the account.
3. Create an API key: <https://platform.openai.com/api-keys>.

`gpt-4o-mini` is cheap — $5 is well over a thousand demo questions. The
backend also caps question length (500 chars) and rate‑limits to 20
requests/min per IP as a backstop.

---

## 1. Backend → Render

1. <https://dashboard.render.com> → **New → Blueprint** → connect this repo.
   Render reads [`render.yaml`](render.yaml) and creates the service.
   - No blueprint? Use **New → Web Service** instead:
     Language **Docker**, Root Directory `backend`, Instance Type **Free**,
     Health Check Path `/api/health`.
2. When prompted, set the environment variable:
   - `OPENAI_API_KEY` = your key from step 0.
3. **Apply / Create**. First build + boot takes ~3–5 min (installs
   ChromaDB, then ingests the PDF). The log ends with `Application startup
   complete`.
4. Open `https://<service>.onrender.com/api/health` — it should show
   `"openai_key_configured": true`.
5. Copy the service URL for the next step.

---

## 2. Frontend → Vercel

1. <https://vercel.com/new> → import this repo. Framework preset **Next.js**
   is detected automatically; leave the root directory as the repo root.
2. **Environment Variables** → add:
   - `NEXT_PUBLIC_API_URL` = the Render URL from step 1
     (e.g. `https://modulhandbuch-backend.onrender.com`, no trailing slash).
3. **Deploy**. When it finishes, the `*.vercel.app` URL is your demo link.

`NEXT_PUBLIC_*` is baked in at build time, so after changing it use
**Deployments → ⋯ → Redeploy**.

CORS needs no configuration: the backend already allows any `*.vercel.app`
origin.

---

## 3. Check it

Open the Vercel URL, ask *"How many ECTS is the Machine Learning module?"*.
The answer streams in with page citations. If the first try errors, the
backend was asleep — wait a minute and retry.

---

## Optional: skip the cold start

A free cron pinger keeps the backend awake during the day:

- <https://console.cron-job.org> → new job → `GET https://<service>.onrender.com/api/health`
  every 10 minutes, e.g. 08:00–20:00. Render's free tier gives 750
  instance‑hours/month; one always‑on service uses ~730, so keep it to
  daytime.

## Optional: custom domain

Point a domain at the Vercel project (Vercel → Settings → Domains). Then in
Render add `CORS_ORIGINS_EXTRA = https://yourdomain.com` so the browser is
allowed to call the API from it.

## If the backend runs out of memory

Render's free instance is 512 MB. Steady state is fine; only the first‑boot
ingestion is heavy. If that boot gets OOM‑killed, build the store locally
and commit it instead:

```bash
cd backend
python -m venv .venv && . .venv/bin/activate      # needs Python 3.12
pip install -r requirements.txt
OPENAI_API_KEY=sk-... python -m app.ingest
git add -f data/chroma && git commit -m "Add prebuilt vector store"
```

With `data/chroma/` populated in the repo, `ensure_ingested` finds it and
skips ingestion on the server.
