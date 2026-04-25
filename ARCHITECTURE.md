# Arch-Enemy - System Architecture & Component Guide

## Current App Shape

Arch-Enemy is a browser-first architecture critique tool. The React app embeds draw.io, listens for draw.io `postMessage` events, sends the current diagram XML to FastAPI, and renders the returned Mermaid diagram, critique, quality-gate metadata, and streamed voice response.

There is no desktop file watcher in the current code path. The active trigger is the draw.io iframe in `frontend/src/App.jsx`.

## Runtime Flow

```text
User edits diagram in embedded draw.io
        |
        | draw.io emits "autosave" or "save" postMessage with XML
        v
frontend/src/App.jsx
        |
        | client SHA-256 duplicate check
        | client 5-second cooldown
        | optional iframe screenshot via html2canvas
        v
POST /analyze/
        |
        | server rate limit: 10/minute
        | server 5-second session cooldown
        | XML quality gate
        v
backend/routers/analyze.py
        |
        | parse draw.io XML -> DiagramGraph
        | diff against previous session snapshot
        | convert graph -> Mermaid
        v
Change detected?
        |
        | no: return has_changes=false + current Mermaid
        |
        | yes
        v
Optional GCP Vision cross-validation
        |
        | screenshot_b64 -> DOCUMENT_TEXT_DETECTION
        | compare OCR labels against XML labels
        | enrich prompt when Vision finds trustworthy extra labels
        v
Snowflake Cortex critique
        |
        | Mermaid + change summary + Vision labels
        | sarcastic Principal Engineer prompt
        | validate response mentions diagram components
        | retry or fallback if validation fails
        v
AnalyzeResponse
        |
        | { has_changes, change_summary, mermaid, critique,
        |   vision_labels, vision_overlap_score, vision_enrichment }
        v
React UI update
        |
        | CritiquePanel: severity, typing animation, Vision note
        | MermaidView: live Mermaid render + changed-node highlighting
        | speakCritique(): send text to TTS WebSocket
        v
WS /ws/session
        |
        | ElevenLabs streams binary audio chunks
        | backend sends {"done": true}
        v
Browser AudioContext queue plays critique
```

## API Surface

### `GET /health`

Defined in `backend/main.py`. Returns backend health and version:

```json
{ "status": "ok", "version": "2.0.0" }
```

### `POST /analyze/`

Defined in `backend/routers/analyze.py`. This is the main diagram analysis endpoint.

Request:

```json
{
  "session_id": "browser-tab-uuid",
  "xml": "<mxGraphModel>...</mxGraphModel>",
  "screenshot_b64": "optional-base64-png"
}
```

Response:

```json
{
  "has_changes": true,
  "change_summary": "Added components: Redis; New connection: API -> Redis",
  "mermaid": "graph TD\n    ...",
  "critique": "Sarcastic architecture feedback...",
  "vision_labels": ["API", "Redis"],
  "vision_overlap_score": 0.75,
  "vision_enrichment": ""
}
```

If the request is within the server cooldown window, the endpoint returns `has_changes=false` with the current Mermaid state instead of throwing a rate-limit style error.

### `DELETE /analyze/session/{session_id}`

Clears in-memory graph and cooldown state for one browser session.

### `WS /ws/session`

Defined in `backend/routers/session.py`. The browser opens this once on app load.

Protocol:

```text
Client -> Server: JSON text frame { "text": "critique text" }
Server -> Client: binary audio chunks from ElevenLabs
Server -> Client: JSON text frame { "done": true }
```

### `POST /ws/webhook/architecture-query`

ElevenLabs client-tool webhook for conversational architecture questions. It rate-limits requests, rejects off-topic questions with a canned response, and uses Snowflake with the current Mermaid diagram as context for relevant questions.

## Backend Components

### `backend/main.py`

Creates the FastAPI app, loads `.env`, installs CORS, attaches SlowAPI rate-limit state, registers the analyze and websocket routers, and exposes `/health`.

### `backend/routers/analyze.py`

Owns the main orchestration path:

1. Enforces a `10/minute` SlowAPI limit.
2. Enforces a per-session 5-second cooldown.
3. Validates the draw.io XML before external API calls.
4. Parses XML to a normalized graph.
5. Diffs the graph against the previous in-memory session graph.
6. Generates Mermaid from the current graph.
7. Optionally calls GCP Vision when a screenshot is provided.
8. Cross-validates XML labels and Vision OCR labels.
9. Calls Snowflake Cortex for a critique.
10. Validates the critique, retries with a hint, and falls back to canned critique text if needed.

Session state is process-local memory:

```text
session_id -> latest DiagramGraph
session_id -> last successful analysis timestamp
```

This is fine for the hackathon/demo setup. A multi-instance deployment would need shared state such as Redis.

### `backend/routers/session.py`

Contains two voice-related flows:

- `tts_websocket()` receives critique text from the browser and streams ElevenLabs audio bytes back over the same WebSocket.
- `elevenlabs_tool_webhook()` handles architecture questions from an ElevenLabs conversational agent, applies the relevance guard, and asks Snowflake for a direct answer.

### `backend/services/xml_parser.py`

Parses draw.io XML into a `DiagramGraph`:

- `nodes`: `mxCell` elements with `vertex="1"`.
- `edges`: `mxCell` elements with `edge="1"`.
- `hash`: SHA-256 of the raw XML.

It strips basic HTML tags from labels and converts the graph to Mermaid `graph TD` syntax.

### `backend/services/diff_engine.py`

Compares the previous and current `DiagramGraph`.

The fast path checks the raw XML hash. If the hash differs, it computes added/removed nodes and edges and emits a human-readable `change_summary` used by the Snowflake prompt and frontend highlighting.

### `backend/services/quality_gates.py`

Centralizes quality controls:

- Gate 1: XML validation and 500 KB payload cap.
- Gate 2: XML label vs GCP Vision label cross-validation.
- Gate 3: critique validation to ensure the response references diagram components.
- Gate 4: lightweight architecture-topic guard for voice questions.

It also owns canned fallback critiques and canned off-topic responses.

### `backend/services/vision_service.py`

Wraps Google Cloud Vision `DOCUMENT_TEXT_DETECTION`. The analyze route only calls it when `screenshot_b64` exists and a diagram change has been detected. Failures are non-fatal; the route continues with XML-only labels.

### `backend/services/snowflake_service.py`

Creates a cached Snowflake connection and calls `SNOWFLAKE.CORTEX.COMPLETE` using `llama3.1-70b`.

The prompt includes:

- the full Mermaid diagram,
- the diff summary,
- XML/Vision labels,
- optional Vision enrichment notes,
- retry hints from the response validator,
- the Arch-Enemy sarcastic system prompt.

`setup_rag_corpus()` creates and seeds `ARCH_ENEMY_DOCS`, but the current critique call does not query that table before invoking Cortex.

### `backend/services/elevenlabs_service.py`

Streams text-to-speech audio for critique text. The WebSocket route yields each binary chunk directly to the browser, then sends a final `{"done": true}` message.

## Frontend Components

### `frontend/src/App.jsx`

Owns the browser workflow:

- Embeds draw.io at `https://embed.diagrams.net/?embed=1&proto=json&spin=1&autosave=1&modified=unsavedChanges`.
- Creates a browser-tab `SESSION_ID` using `crypto.randomUUID()`.
- Connects the TTS WebSocket on mount.
- Listens for draw.io `init`, `autosave`, and `save` messages.
- Hashes XML with `crypto.subtle.digest`.
- Applies a client-side 5-second cooldown.
- Attempts an iframe screenshot with `html2canvas`.
- Calls `analyzeDiagram()`.
- Updates Mermaid, critique, severity, Vision metadata, and highlighted nodes.
- Sends critique text to the TTS WebSocket.

### `frontend/src/api.js`

Centralizes backend communication:

- `analyzeDiagram(sessionId, xml, screenshotB64)` posts to `/analyze/`.
- `clearSession(sessionId)` deletes backend session state.
- `connectTTSSocket()` opens `/ws/session` and queues binary audio chunks.
- `speakCritique(text)` sends critique text to the open WebSocket.

Audio playback uses a browser `AudioContext`, decodes chunks, and skips invalid chunks so the queue can keep moving.

### `frontend/src/components/CritiquePanel.jsx`

Displays critique state:

- severity gauge,
- change summary badge,
- typewriter critique animation,
- Vision enrichment note.

Severity is derived in `App.jsx` from keywords in the critique text.

### `frontend/src/components/MermaidView.jsx`

Renders the Mermaid diagram with `mermaid.render()`, injects the resulting SVG into the DOM, and applies the `arch-enemy-highlight` class to matching node labels. Highlights clear after a short timeout through the callback from `App.jsx`.

## Quality and Cost Controls

- Client hash check skips unchanged XML before the network call.
- Client cooldown prevents rapid UI-triggered analysis.
- Server cooldown prevents rapid repeated analysis for the same session.
- SlowAPI rate limits `/analyze/` to `10/minute` and the voice webhook to `5/minute`.
- Invalid XML is rejected before Vision or Snowflake calls.
- Vision is optional and non-fatal.
- Snowflake responses are validated against component names.
- Fallback critiques keep the demo usable when Snowflake fails or returns unusable text.

## Current Limitations

- Session state is in-memory and resets on backend restart.
- Multiple backend instances would not share diagram history or cooldown state.
- Screenshot capture is attempted from the browser iframe; browser security/CORS can make it return `null`.
- The Snowflake RAG corpus setup exists, but the current critique path only calls Cortex completion with prompt context.
- Mermaid highlighting depends on rendered SVG labels matching the labels parsed from `change_summary`.
