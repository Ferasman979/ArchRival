# Local Integration Guide (Frontend + Backend + Voice)

This guide helps a frontend teammate integrate with the backend locally and validate the full architecture flow:

`draw.io change -> /analyze -> critique + Mermaid -> TTS over /ws/session -> voice playback`

## 1) Prerequisites

- Node.js and npm installed
- Python 3.11+ installed
- Backend `.env` configured with working Snowflake + ElevenLabs credentials
- ngrok installed and authenticated

## 2) Start Backend

From repo root:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

If needed, create env file:

```powershell
copy .env.example .env
```

Run backend:

```powershell
uvicorn main:app --host 127.0.0.1 --port 8000
```

Verify health:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/health
```

Expected: status 200 and JSON `{"status":"ok","version":"2.0.0"}`.

## 3) Start ngrok (for ElevenLabs webhook testing)

In a second terminal:

```powershell
& "C:\Program Files\WindowsApps\ngrok.ngrok_3.36.1.0_x64__1g87z0zv29zzc\ngrok.exe" http 8000
```

Copy the HTTPS forwarding URL and verify:

```powershell
Invoke-WebRequest -UseBasicParsing https://<your-ngrok-domain>/health
```

Note: if ngrok shows an interstitial warning in scripted calls, include header `ngrok-skip-browser-warning: 1`.

## 4) Start Frontend

In a third terminal:

```powershell
cd frontend
npm install
npm run dev
```

Set frontend API URL if needed:

- `VITE_API_URL=http://localhost:8000`

Open the Vite URL (usually `http://localhost:5173`).

## 5) Validate Core Backend Integration from Frontend

In the frontend app:

1. Confirm draw.io iframe loads.
2. Make a simple diagram change.
3. Confirm frontend posts to `POST /analyze/`.
4. Confirm UI receives:
   - `mermaid`
   - `critique`
   - `change_summary`
   - vision metadata fields
5. Confirm Mermaid preview updates and critique panel renders.

## 6) Validate Voice Output Path

Frontend should:

1. Open TTS socket on load: `ws://localhost:8000/ws/session`
2. Call `speakCritique(critique)` after receiving analyze response
3. Receive binary chunks and play them via `AudioContext`

Success criteria:

- You hear spoken critique in browser.
- WebSocket closes/continues cleanly after `{"done": true}`.

## 7) Validate ElevenLabs Tool Webhook (Optional but recommended)

Use this script from repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\test_elevenlabs_webhook.ps1
```

It posts to:

- `https://<your-ngrok-domain>/ws/webhook/architecture-query`

Expected:

- JSON object with non-empty `result` critique text.

## 8) Common Local Issues and Fixes

- **Port 8000 already in use**
  - Stop duplicate backend processes; keep exactly one `uvicorn`.
- **ngrok 8012 upstream error**
  - Backend is not listening on `127.0.0.1:8000`; restart backend first.
- **ngrok root shows `{"detail":"Not Found"}`**
  - Normal. Use `/health` or actual API routes.
- **Repeated fallback critique**
  - Verify backend process is using latest `.env`.
  - Restart backend after env changes.
  - Re-run webhook test script.
- **No voice playback**
  - Verify `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID`.
  - Check frontend is sending critique text to `/ws/session`.

## 9) End-to-End Done Checklist

- [ ] `GET /health` works locally
- [ ] Frontend calls `/analyze` on diagram change
- [ ] Critique + Mermaid render in UI
- [ ] TTS socket returns audio and browser plays it
- [ ] (Optional) ngrok webhook test returns valid `result`
