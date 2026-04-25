# Arch-Enemy — Team Sprint Plan

## Time Estimate: 5–6 Hours Total

```
Hour 0:00  → Team setup, git init, env files shared via Discord/Slack
Hour 0:30  → Everyone has backend running (mock or real)
Hour 2:00  → Core pipeline working end-to-end (API → Snowflake → ElevenLabs)
Hour 3:30  → UI connected to real backend, polling live
Hour 4:30  → Integration complete, polish begins
Hour 5:30  → Demo rehearsal, fix any breakage
Hour 6:00  → Submit
```

---

## Team Division (3 People, Fully Parallel from Minute 1)

### 🧠 Person A — Backend: LLM Pipeline (Snowflake + ElevenLabs)
**Branch:** `feature/llm-pipeline`  
**Files owned:** `backend/services/snowflake_service.py`, `backend/services/elevenlabs_service.py`, `backend/routers/session.py`

#### Hour-by-Hour
| Time | Task |
|:--|:--|
| 0:00–0:30 | Set up GCP project, get Snowflake credentials from team, run `pip install -r requirements.txt`, copy `.env.example` → `.env` and fill Snowflake/ElevenLabs keys |
| 0:30–1:30 | Run `snowflake_service.setup_rag_corpus()` to load docs. Test `get_critique()` in isolation with hardcoded Mermaid input. Verify the sarcastic persona works. |
| 1:30–2:30 | Tune the system prompt. Add 10–15 more best-practice entries to the RAG corpus (AWS Well-Architected, k8s, CAP theorem gotchas). Test ElevenLabs `stream_tts()` function with a hardcoded sentence. |
| 2:30–3:30 | Wire `routers/session.py` WebSocket. Test end-to-end: send text → receive audio. Adjust ElevenLabs voice settings (stability/style) for maximum personality. |
| 3:30–5:00 | Integration testing with Person B's analyze endpoint. Fix any Snowflake cold-start latency issues. Pre-warm connection on startup. |
| 5:00–6:00 | Polish sarcastic responses, add 5 more RAG docs, rehearse demo script |

#### Test Command (standalone)
```python
# backend/services/snowflake_service.py — run directly
if __name__ == "__main__":
    result = get_critique(
        mermaid_diagram="graph TD\n  API --> DB",
        change_summary="Added direct API to DB connection with no caching",
        vision_labels=["FastAPI", "PostgreSQL"]
    )
    print(result)
```

---

### ⚙️ Person B — Backend: Vision + Diff Engine + API Orchestration
**Branch:** `feature/vision-pipeline`  
**Files owned:** `backend/services/xml_parser.py`, `backend/services/diff_engine.py`, `backend/services/vision_service.py`, `backend/routers/analyze.py`, `backend/main.py`

#### Hour-by-Hour
| Time | Task |
|:--|:--|
| 0:00–0:30 | Set up GCP project, enable Vision API in Cloud Console, download service account JSON → save as `backend/gcp-credentials.json`. Set `GOOGLE_APPLICATION_CREDENTIALS` in `.env`. |
| 0:30–1:30 | Test `xml_parser.py` with a sample `.drawio` XML file. Verify nodes and edges parse correctly. Test `graph_to_mermaid()` output. |
| 1:30–2:30 | Test `diff_engine.py` by calling `diff_graphs()` with two different graphs. Verify `has_changes=False` when hash matches. Test with added/removed nodes. |
| 2:30–3:00 | Test `vision_service.py`: take a screenshot of any draw.io diagram, call `extract_labels_from_screenshot()`, verify labels come back. |
| 3:00–4:00 | Run `uvicorn main:app --reload`, test `POST /analyze/` via curl or Postman with sample XML. Confirm full pipeline response. |
| 4:00–5:30 | Integration with Person A (Snowflake critique comes back in response). Fix any edge cases: empty diagrams, malformed XML, very large diagrams. |
| 5:30–6:00 | Final testing, demo prep |

#### GCP Setup (30 min, do this first)
```
1. Go to console.cloud.google.com
2. Create project "arch-enemy"
3. Enable "Cloud Vision API"
4. IAM → Service Accounts → Create → Download JSON key
5. Save as backend/gcp-credentials.json
```

#### Test Command (standalone)
```bash
# From backend/ directory
python -c "
from services.xml_parser import parse_drawio_xml, graph_to_mermaid
xml = '<mxGraphModel><root><mxCell id=\"0\"/><mxCell id=\"1\"/><mxCell id=\"2\" value=\"FastAPI\" vertex=\"1\"><mxGeometry/></mxCell><mxCell id=\"3\" value=\"PostgreSQL\" vertex=\"1\"><mxGeometry/></mxCell><mxCell id=\"4\" edge=\"1\" source=\"2\" target=\"3\"><mxGeometry/></mxCell></root></mxGraphModel>'
graph = parse_drawio_xml(xml)
print(graph_to_mermaid(graph))
"
```

---

### 🎨 Person C — Frontend: UI + WebSocket Listener + Highlighting
**Branch:** `feature/frontend`  
**Files owned:** Everything in `frontend/src/`


> The trigger chain is: **User saves draw.io → `watcher.py` detects change → watcher POSTs to backend → backend pushes critique to browser via WebSocket → UI updates.**
> Person C's job is to make the browser react beautifully to what the WebSocket pushes in.

#### Hour-by-Hour
| Time | Task |
|:--|:--|
| 0:00–0:30 | `npm install` in `frontend/`, run `npm run dev`. Start mock server: `cd shared && python mock_server.py`. Verify mock pushes arrive via WebSocket. |
| 0:30–1:30 | Build the split-panel layout in `App.jsx` — left panel: draw.io iframe (display only); right panel: Mermaid renderer + critique panel. |
| 1:30–2:30 | Build the **WebSocket listener** in `useEffect` — connect to `/ws/session` on mount, parse incoming `{ mermaid, critique, change_summary, vision_labels }` messages, update React state. |
| 2:30–3:30 | Build **Critique Panel**: severity gauge (🟢→🔴), critique text with character-by-character typing animation, change summary badge. Implement **Mermaid node highlighting** (see detail below). |
| 3:30–4:30 | Build **audio playback queue** — receive binary audio chunks from WebSocket, decode via `AudioContext`, play sequentially. Add waveform visualizer that animates while audio plays. |
| 4:30–5:30 | Point to real backend (update `.env` `VITE_API_URL`). Full integration test with real watcher running. Polish dark theme, transition animations, severity colors. |
| 5:30–6:00 | Demo prep — open a real `.drawio` file, save bad architectures, verify voice + highlights fire correctly. |

---

#### How the WebSocket Listener Works (No Polling)

```javascript
// In App.jsx — runs once on mount
useEffect(() => {
  const ws = new WebSocket(`${import.meta.env.VITE_WS_URL}/ws/session`);
  ws.binaryType = "arraybuffer";

  ws.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      // Binary frame = audio chunk — queue for playback
      audioQueue.push(event.data);
      if (!isPlaying) playNextChunk();
    } else {
      const payload = JSON.parse(event.data);
      if (payload.done) {
        // TTS finished — fade highlights after 3s
        setTimeout(clearHighlights, 3000);
        return;
      }
      // Update all UI state from a single push
      setMermaidCode(payload.mermaid);
      setCritique(payload.critique);
      setChangeSummary(payload.change_summary);
      setSeverity(deriveSeverity(payload.critique));
      setHighlightedNodes(extractChangedNodes(payload.change_summary));
    }
  };

  return () => ws.close();
}, []);
```

> [!IMPORTANT]
> Ask Person A/B to update `watcher.py` so the WebSocket push sends a **combined JSON payload** — not just the critique string — including `mermaid`, `change_summary`, and `vision_labels`. The frontend needs all of these in one message.

---

#### Mermaid Node Highlighting — Detailed Implementation

The goal: when a critique fires, the **specific nodes that changed** glow red/amber in the rendered Mermaid diagram. This is the visual centrepiece of the UI.

**Step 1 — Parse `change_summary` to extract node labels**

The backend sends `change_summary` like:
```
"Added components: MongoDB; New connection: FastAPI → MongoDB"
```

Parse it:
```javascript
function extractChangedNodes(changeSummary) {
  const nodes = new Set();
  const addedMatch = changeSummary.match(/Added components?: ([^;]+)/);
  const connMatches = [...changeSummary.matchAll(/connection: (\S+) → (\S+)/g)];

  if (addedMatch) addedMatch[1].split(",").forEach(s => nodes.add(s.trim()));
  connMatches.forEach(m => { nodes.add(m[1]); nodes.add(m[2]); });

  return nodes; // e.g. Set { "MongoDB", "FastAPI" }
}
```

**Step 2 — Render Mermaid then inject highlight classes into the SVG**

Mermaid renders as a live `<svg>` in the DOM. After each render, walk the node `<g>` elements and apply a CSS class to matched labels:

```javascript
async function renderAndHighlight(mermaidCode, highlightedNodes) {
  const { svg } = await mermaid.render("arch-diagram", mermaidCode);
  const container = document.getElementById("mermaid-container");
  container.innerHTML = svg;

  const svgEl = container.querySelector("svg");
  // Mermaid wraps each node in a <g class="node"> or <g class="flowchart-label">
  svgEl.querySelectorAll("g.node, g.flowchart-label").forEach((group) => {
    const label = group.querySelector("text, span, p")?.textContent?.trim();
    if (label && highlightedNodes.has(label)) {
      group.classList.add("arch-enemy-highlight");
    }
  });
}
```

Call this every time `mermaidCode` or `highlightedNodes` state changes.

**Step 3 — CSS for the pulsing glow**

```css
/* index.css */
.arch-enemy-highlight rect,
.arch-enemy-highlight circle,
.arch-enemy-highlight polygon {
  stroke: #ef4444 !important;
  stroke-width: 3px !important;
  animation: node-pulse 1.2s ease-in-out infinite alternate;
}

@keyframes node-pulse {
  from { filter: drop-shadow(0 0 4px #ef4444); }
  to   { filter: drop-shadow(0 0 18px #ef4444); stroke-width: 4px; }
}
```

**Step 4 — Clear highlights when TTS finishes**

```javascript
function clearHighlights() {
  document.querySelectorAll(".arch-enemy-highlight")
    .forEach(el => el.classList.remove("arch-enemy-highlight"));
}
// Called 3 seconds after WebSocket sends { done: true }
```

**Step 5 — Severity gauge (🟢 → 🟠 → 🔴)**

```javascript
function deriveSeverity(critique = "") {
  const t = critique.toLowerCase();
  if (t.includes("cursed") || t.includes("disaster") || t.includes("single point"))
    return "critical";  // 🔴 red gauge, pulsing border
  if (t.includes("impressed") || t.includes("good") || t.includes("finally"))
    return "good";      // 🟢 green gauge
  return "warning";     // 🟠 amber gauge (default)
}
```

---

#### Key Files Person C Creates
| File | Purpose |
|:--|:--|
| `src/App.jsx` | Root layout, WebSocket setup, global state |
| `src/components/CritiquePanel.jsx` | Severity gauge + critique text + typing animation |
| `src/components/MermaidView.jsx` | Renders Mermaid SVG + node highlighting |
| `src/components/AudioPlayer.jsx` | AudioContext chunk queue + waveform visualizer |
| `src/hooks/useWebSocket.js` | WS connection, reconnection, binary/text routing |
| `src/api.js` | Already scaffolded — import from here only |
| `src/index.css` | Dark theme + `.arch-enemy-highlight` + gauge styles |

---

## Integration Checkpoints

| Time | Checkpoint | Owner |
|:--|:--|:--|
| **T+1h** | Backend runs at `localhost:8000/health` | Person B |
| **T+1h** | Mock server returns data to frontend | Person C |
| **T+2h** | `POST /analyze/` returns real Snowflake critique | Person A + B |
| **T+3h** | Frontend polling sends XML → gets back Mermaid + critique | B + C |
| **T+3:30h** | Voice plays in browser when critique arrives | A + C |
| **T+4:30h** | Full end-to-end on a real draw.io diagram | All 3 |
| **T+5:30h** | Demo rehearsed, backup video recorded | All 3 |

---

## How to Run Everything

### Backend (Person A or B)
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
cp .env.example .env            # Fill in your keys
uvicorn main:app --reload --port 8000
```

### Mock Server (Person C, no keys needed)
```bash
cd shared
pip install fastapi uvicorn
python mock_server.py
# Running at http://localhost:8000
```

### Frontend (Person C)
```bash
cd frontend
npm install
npm run dev
# Running at http://localhost:5173
```

---

## Git Workflow

```bash
# Each person works on their branch
git checkout -b feature/llm-pipeline      # Person A
git checkout -b feature/vision-pipeline   # Person B
git checkout -b feature/frontend          # Person C

# Merge to main at each integration checkpoint
git checkout main
git merge feature/vision-pipeline
git merge feature/llm-pipeline
git merge feature/frontend
```

---

## Emergency Fallbacks (If Something Breaks)

| Failure | Fallback |
|:--|:--|
| Snowflake down | Hardcode 10 sarcastic critique strings, rotate them |
| GCP Vision auth fails | Skip Vision step — XML parser has all structure info |
| ElevenLabs WebSocket fails | Use REST TTS endpoint (`/v1/text-to-speech/{id}`) and play via `<audio>` tag |
| draw.io postMessage doesn't work | Add a file upload button — user exports `.drawio` file and uploads it |
| Backend crashes | Run mock server, demo from recorded video |
