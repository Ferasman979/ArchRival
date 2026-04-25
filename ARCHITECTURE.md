# Arch-Enemy — System Architecture & Component Guide

## How the App Works in Production

Arch-Enemy watches a draw.io diagram file on the local filesystem. The moment the user saves a change in draw.io Desktop, a background watcher script detects the file modification, extracts the XML, diffs it against the previous snapshot, takes a targeted screenshot of the draw.io window, and fires the full AI pipeline — all within ~2 seconds. The user hears sarcastic voice feedback through their speakers without touching the browser.

---

## Production Data Flow (Step by Step)

```
User draws in draw.io Desktop
        │
        │ (saves file — Ctrl+S)
        ▼
[1] File Watcher (watcher.py)
    Detects .drawio file mtime change
    Reads new XML from disk
        │
        ▼
[2] Diff Engine (diff_engine.py)
    SHA-256 hash of XML
    Compare to previous snapshot
    ─── No change? ──────────────────── STOP (nothing happens)
    ─── Change detected? ────────────────────────────────────────┐
                                                                  │
        ▼                                                         │
[3] Screenshot Capture (watcher.py)                              │
    Find draw.io window by title                                  │
    Capture just that window (not full screen)                    │
    Encode as base64 PNG                                          │
        │                                                         │
        └─────────────────────────────────────────────────────────┘
        ▼
[4] POST /analyze/ (FastAPI — analyze.py)
    Receives: { session_id, xml, screenshot_b64 }
    Runs in parallel:
      ├── GCP Vision API  →  extracts text labels from screenshot
      └── XML Parser      →  builds structured graph from XML
    Merges results → generates Mermaid diagram string
        │
        ▼
[5] Snowflake Cortex LLM (snowflake_service.py)
    Mermaid + diff summary + vision labels → RAG query
    Retrieves relevant best-practice docs from Snowflake table
    LLM generates sarcastic 2-4 sentence critique
        │
        ▼
[6] WebSocket → Browser (session.py)
    Backend sends critique text to frontend via WS
        │
        ▼
[7] ElevenLabs TTS (elevenlabs_service.py)
    Critique text → streamed audio chunks (sentence by sentence)
    First audio chunk plays in ~1.5s from change detection
        │
        ▼
[8] Browser UI (React frontend)
    Plays streaming audio
    Renders updated Mermaid diagram
    Updates severity gauge 🟢→🔴
    Displays critique text with typing animation
```

---

## Component Reference

### `watcher.py` — The Autonomous Trigger
**What it is:** A standalone Python script that runs permanently in the background alongside the app. It is the entry point for the entire pipeline.

**What it does:**
- Watches the `.drawio` file path using OS-level filesystem events (`watchdog` library — no polling, near-instant detection)
- On file modification: reads raw XML, hashes it, compares to previous
- If the hash is different: captures a screenshot of just the draw.io Desktop window using `pygetwindow` + `Pillow`
- POSTs the XML + base64 screenshot to the FastAPI backend at `/analyze/`
- Receives the critique text from the response, forwards it to the frontend via a WebSocket push

**Why it's standalone:** Decoupling the trigger from the server means the watcher can restart independently. It also means it runs on the same machine as draw.io (which has the file and the window), while the backend could technically run on any machine.

---

### `main.py` — FastAPI Application Entry Point
**What it is:** The root of the Python backend web server.

**What it does:**
- Starts the FastAPI app and registers all routers
- Configures CORS so the React frontend (running on `localhost:5173`) can talk to it
- Exposes `POST /analyze/`, `DELETE /analyze/session/{id}`, `WS /ws/session`, and `GET /health`
- Loads environment variables from `.env` on startup

---

### `routers/analyze.py` — Pipeline Orchestrator
**What it is:** The main REST endpoint. Receives the diagram snapshot from the watcher and orchestrates all downstream services.

**What it does:**
1. Accepts `{ session_id, xml, screenshot_b64 }` from the watcher
2. Parses XML → graph via `xml_parser`
3. Diffs graph vs previous snapshot via `diff_engine`
4. If no change → returns immediately (no API calls made, no cost)
5. If changed → calls GCP Vision on the screenshot in parallel with Mermaid generation
6. Feeds results to `snowflake_service.get_critique()`
7. Returns `{ has_changes, mermaid, critique, vision_labels, change_summary }` to the watcher
8. The watcher then forwards the critique text to the browser UI via WebSocket

**Session state:** Stores the last `DiagramGraph` snapshot per `session_id` in memory. On restart, state resets (fine for a hackathon; use Redis for production persistence).

---

### `routers/session.py` — TTS WebSocket Bridge
**What it is:** A persistent WebSocket connection between the backend and the browser.

**What it does:**
- Accepts an open WebSocket connection from the React frontend on app load
- Waits for critique text messages (sent from the watcher via HTTP after `/analyze/` returns)
- For each critique: streams audio chunks from ElevenLabs back to the browser as binary frames
- Sends `{ done: true }` when the full audio is delivered
- The browser plays chunks as they arrive — audio starts before the full response is ready

---

### `services/xml_parser.py` — Diagram Structure Extractor
**What it is:** A pure Python parser with zero external API dependencies.

**What it does:**
- Parses `.drawio` XML (`mxGraphModel` format) using Python's built-in `xml.etree.ElementTree`
- Extracts **vertices** (`mxCell` with `vertex="1"`) → nodes with labels and IDs
- Extracts **edges** (`mxCell` with `edge="1"`) → connections with `source`, `target`, optional labels
- Strips HTML formatting from label `value` attributes (draw.io stores labels as `<b>FastAPI</b>`)
- Converts the graph to **Mermaid syntax** (`graph TD` flowchart) for LLM input
- Computes a **SHA-256 hash** of the raw XML for use by the diff engine

**Why it matters:** This is the component that makes GCP Vision optional rather than mandatory. The full graph structure (nodes + connections) comes from here. Vision only adds label confirmation.

---

### `services/diff_engine.py` — Change Detector
**What it is:** A pure Python comparison engine with no external dependencies.

**What it does:**
- Takes the previous `DiagramGraph` snapshot and the current one
- **Fast path:** Compares SHA-256 hashes first. If identical → `has_changes=False`, return immediately (no further processing)
- **Slow path:** Computes exact set differences for nodes and edges
- Returns a `DiagramDiff` with: `added_nodes`, `removed_nodes`, `added_edges`, `removed_edges`, and a `change_summary` string
- `change_summary` is a natural-language description used in the Snowflake LLM prompt (e.g., `"Added components: MongoDB; New connection: API → MongoDB"`)

**Why it's the gatekeeper:** Nothing downstream (GCP Vision, Snowflake, ElevenLabs) runs unless this engine returns `has_changes=True`. This keeps API costs near-zero during normal usage.

---

### `services/vision_service.py` — GCP Vision Integration
**What it is:** A thin wrapper around the Google Cloud Vision client SDK.

**What it does:**
- Sends the draw.io window screenshot to GCP Vision's `DOCUMENT_TEXT_DETECTION` feature
- This mode is optimized for dense, structured text (better than `TEXT_DETECTION` for diagram labels)
- Returns a flat list of detected text strings (component names, annotations, labels visible on screen)
- These labels cross-validate the XML parser results and catch any rendered text not in the XML (e.g., auto-generated labels, images with text)
- The Vision client is lazy-initialized once and reused (avoids repeated auth overhead)

**Graceful degradation:** If Vision fails (network issue, quota exceeded), the analyze endpoint catches the exception, sets `vision_labels=[]`, and continues with XML-only data. The critique quality degrades slightly but the pipeline does not crash.

---

### `services/snowflake_service.py` — LLM + RAG Core
**What it is:** The AI brain of the application. Queries Snowflake Cortex with RAG-augmented context.

**What it does:**
- Maintains a cached Snowflake connection (avoids per-request cold starts)
- Stores a **RAG corpus** in a Snowflake table (`ARCH_ENEMY_DOCS`) containing best-practice documentation: AWS Well-Architected Framework, Databricks scaling limits, CNCF k8s guidelines, system design anti-patterns
- Uses `SNOWFLAKE.CORTEX.COMPLETE()` with `llama3.1-70b` as the LLM
- Passes: full Mermaid diagram + diff change summary + Vision labels + sarcastic system prompt
- The system prompt enforces: sarcastic but technically accurate, 2-4 sentences max, references specific components by name, ends with one actionable recommendation
- Returns the critique string

---

### `services/elevenlabs_service.py` — Voice Persona
**What it is:** The voice output layer that gives Arch-Enemy its personality.

**What it does:**
- Connects to ElevenLabs via WebSocket (not REST) for streaming delivery
- Uses `eleven_flash_v2_5` model with `optimize_streaming_latency=4` — the fastest available configuration
- Splits critique text into sentences before sending — each sentence is streamed independently so audio starts playing before the full response is generated
- Voice settings: `stability=0.4` (low = more expressive, more dramatic), `style=0.6` (adds vocal character)
- Yields raw audio bytes as chunks; the browser plays them in sequence as they arrive

---

### `frontend/src/api.js` — Browser Communication Layer
**What it is:** The single file that manages all browser-to-backend communication.

**What it does:**
- `analyzeDiagram()` — REST POST to `/analyze/` (called by the watcher, not the browser directly in prod)
- `connectTTSSocket()` — Opens the persistent WebSocket to `/ws/session` on app load
- `speakCritique()` — Sends critique text through the WebSocket to trigger TTS streaming
- Audio playback queue: manages `AudioContext` chunks, plays them sequentially without gaps, handles invalid chunks gracefully

---

### `shared/mock_server.py` — Development Stub
**What it is:** A fully functional fake backend for frontend development.

**What it does:**
- Mimics every real endpoint (`POST /analyze/`, `WS /ws/session`, `DELETE /analyze/session/...`)
- Returns realistic fake critique text and Mermaid diagrams
- Lets the frontend developer work completely independently with zero API keys
- Remove entirely in production; replace with the real backend

---

## Production Component Interaction Map

```
                      ┌─────────────────────┐
                      │  draw.io Desktop App │
                      │  (user draws here)   │
                      └─────────┬───────────┘
                                │ Ctrl+S saves .drawio file
                                ▼
                      ┌─────────────────────┐
                      │    watcher.py        │◄─── runs forever in background
                      │  (file watcher)      │
                      └──────┬──────┬───────┘
                             │      │
              reads XML      │      │  captures window screenshot
                             ▼      ▼
                      ┌─────────────────────┐
                      │  diff_engine.py      │──── hash match? ──── STOP
                      │  (change gate)       │
                      └─────────┬───────────┘
                                │ change detected
                                ▼
              ┌─────────────────────────────────┐
              │     POST /analyze/              │
              │     (FastAPI — analyze.py)      │
              └──────┬─────────────┬────────────┘
                     │             │ (parallel)
                     ▼             ▼
            ┌──────────────┐  ┌──────────────────┐
            │ xml_parser   │  │  vision_service  │
            │ → Mermaid    │  │  → GCP Vision    │
            └──────┬───────┘  └────────┬─────────┘
                   └──────────┬─────────┘
                              ▼
                   ┌─────────────────────┐
                   │ snowflake_service   │
                   │ Cortex LLM + RAG   │
                   └─────────┬───────────┘
                             │  critique text
                             ▼
                   ┌─────────────────────┐
                   │ session.py (WS)     │
                   │ + elevenlabs_service│
                   └─────────┬───────────┘
                             │  streaming audio chunks
                             ▼
                   ┌─────────────────────┐
                   │  React Browser UI   │
                   │  - plays audio      │
                   │  - renders Mermaid  │
                   │  - severity gauge   │
                   └─────────────────────┘
```

---

## Autonomous Screenshot Capture: How It Works

### The Problem
draw.io Desktop saves `.drawio` files to the local filesystem. The browser has no access to local files. We need an OS-level trigger — not browser polling.

### The Solution: `watcher.py` (File System Watcher)
A Python script using the `watchdog` library watches the `.drawio` file for filesystem modification events. When the OS signals the file has been saved:

1. The watcher reads the file, hashes the XML
2. If the hash changed, it captures a screenshot of **only the draw.io window** (not the entire screen) using `pygetwindow` + `Pillow`
3. It POSTs the XML + screenshot to the backend

### Why File Modification Time, Not Polling
- **Polling** (checking every 2s): wastes CPU, has up to 2s delay, misses rapid saves
- **`watchdog` filesystem events**: near-instant (< 100ms), zero CPU overhead when idle, triggers exactly once per save

### Screenshot Targeting
Instead of capturing the full screen, `pygetwindow` finds the window whose title contains "draw.io" and captures only that region. This gives GCP Vision a clean, high-contrast image of exactly the diagram — no taskbars, other apps, or desktop noise.

The full implementation is in `watcher.py` (see below).
