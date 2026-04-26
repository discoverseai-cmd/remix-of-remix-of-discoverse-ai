# Discoverse Agent Worker

External Node service that runs the LangGraph agent loop for Discoverse.

## What it does

- Receives `POST /runs` from the TanStack app with a `run_id` (already inserted in `agent_runs`).
- Runs a LangGraph plan → tool → observe loop using **Lovable AI** as the LLM.
- Tools: **Firecrawl** (scrape/search/map/crawl), **E2B** (code execution), **pgvector memory** (per-session + per-user), **read attachments** (from your `chat-attachments` Supabase bucket).
- Streams every step into `public.agent_steps` via the Supabase service role.
- Meters credits **per LLM call and per tool call** through the `record_agent_step` RPC. If credits hit 0 mid-run, the worker marks the run `aborted_no_credits`.

## Deploy (Render.com — easiest)

1. Push this `agent-worker/` folder to a new GitHub repo.
2. Render.com → New → Web Service → connect that repo.
3. Runtime: **Node 20**. Build: `npm install && npm run build`. Start: `npm start`.
4. Add env vars (see `.env.example`):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `LOVABLE_API_KEY`
   - `FIRECRAWL_API_KEY`
   - `E2B_API_KEY`
   - `WORKER_SHARED_SECRET` (any long random string — must match the one you set in Lovable secrets)
5. Copy the public URL Render gives you (e.g. `https://discoverse-agent.onrender.com`).
6. In Lovable, add secrets `WORKER_BASE_URL` (the URL above) and `WORKER_SHARED_SECRET` (same value).

Fly.io / Railway / your own VPS work the same way — any Node 20 host.

## API

### `POST /runs`
Headers: `x-worker-secret: <WORKER_SHARED_SECRET>`
Body: `{ "run_id": "<uuid>" }`
Returns `202` immediately and runs the agent in the background.

### `GET /healthz`
Returns `{ ok: true }`.
