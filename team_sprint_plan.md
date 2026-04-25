# Arch-Enemy - Team Sprint Plan

## Time Estimate: 4 Hours Total

```text
Hour 0:00  -> Team setup, branches created, env files shared
Hour 0:30  -> Everyone has their local piece running
Hour 1:30  -> Backend analyze path works with fallback or real critique
Hour 2:15  -> Snowflake critique + ElevenLabs TTS tested independently
Hour 3:00  -> Frontend connected to real backend analyze response
Hour 3:30  -> End-to-end flow works from draw.io edit to UI update + audio
Hour 4:00  -> Demo rehearsal, polish, submit
```

---

## Team Division (3 People, Fully Parallel from Minute 1)

The trigger chain is:

```text
User edits embedded draw.io iframe
  -> draw.io sends autosave/save postMessage with XML
  -> App.jsx hashes XML and POSTs to /analyze/
  -> backend validates, parses, diffs, optionally checks Vision
  -> Snowflake or fallback returns critique
  -> frontend renders Mermaid + critique + highlights
  -> frontend sends critique text to /ws/session for ElevenLabs audio
```

Each person owns a separate component and can test it independently. Fatima can use mock analyze responses while Umar finishes `/analyze/`. Umar can use fallback critiques while Feras finishes Snowflake. Feras can test TTS with hardcoded text before frontend integration.

---

### Feras - Backend: Snowflake + ElevenLabs Integration

**Branch:** `feature/llm-pipeline`
**Files owned:** `backend/services/snowflake_service.py`, `backend/services/elevenlabs_service.py`, `backend/routers/session.py`

#### Hour-by-Hour

| Time | Task |
|:--|:--|
| 0:00-0:30 | Get Snowflake and ElevenLabs keys from the team. Run `pip install -r requirements.txt`, copy `.env.example` to `.env`, and fill Snowflake/ElevenLabs values. |
| 0:30-1:15 | Test `get_critique()` in isolation with hardcoded Mermaid input and a change summary. Confirm it returns a short, sarcastic, technically accurate critique. |
| 1:15-2:00 | Test `stream_tts()` with one hardcoded critique sentence. Confirm ElevenLabs returns playable audio chunks. |
| 2:00-2:45 | Verify `routers/session.py` WebSocket: browser/client sends `{ "text": "..." }`, backend streams binary audio chunks, then sends `{ "done": true }`. |
| 2:45-3:30 | Test `/ws/webhook/architecture-query` with one architecture question and one off-topic question. Confirm off-topic questions do not hit Snowflake. |
| 3:30-4:00 | Integrate with Fatima's frontend. Tune the prompt or voice settings only if the demo critique/audio is weak. |

#### Test Command (Standalone)

```python
# From backend/ directory
from services.snowflake_service import get_critique

result = get_critique(
    mermaid_diagram='graph TD\n    API["API"] --> DB["PostgreSQL"]',
    change_summary="New connection: API -> PostgreSQL",
    vision_labels=["API", "PostgreSQL"],
    enrichment_note="",
    retry_hint="",
)
print(result)
```

#### Feras Fallbacks

| Failure | Fallback |
|:--|:--|
| Snowflake credentials fail | Let Umar return `get_fallback_critique()` so frontend integration continues. |
| Snowflake critique is too generic | Add a stronger `retry_hint` and tighten the system prompt. |
| ElevenLabs WebSocket fails | Skip audio for the demo and keep text critique + Mermaid working. |
| Voice webhook not ready | De-scope voice Q&A; prioritize critique TTS. |

---

### Umar - Backend: Analyze API, XML Parser, Diff Engine, Vision, Quality Gates

**Branch:** `feature/vision-pipeline`
**Files owned:** `backend/main.py`, `backend/routers/analyze.py`, `backend/services/xml_parser.py`, `backend/services/diff_engine.py`, `backend/services/vision_service.py`, `backend/services/quality_gates.py`

#### Hour-by-Hour

| Time | Task |
|:--|:--|
| 0:00-0:30 | Start backend with `uvicorn main:app --reload --port 8000`. Verify `GET /health` and CORS for `http://localhost:5173`. |
| 0:30-1:00 | Test `xml_parser.py` with sample draw.io XML. Verify nodes, edges, labels, and `graph_to_mermaid()` output. |
| 1:00-1:30 | Test `diff_engine.py` with previous/current graphs. Verify unchanged XML returns `has_changes=False`; added nodes/edges produce a useful `change_summary`. |
| 1:30-2:15 | Test `POST /analyze/` with sample XML. Confirm response includes `has_changes`, `change_summary`, `mermaid`, `critique`, `vision_labels`, `vision_overlap_score`, and `vision_enrichment`. |
| 2:15-2:45 | Verify quality gates: invalid XML, empty XML, 500 KB limit, server cooldown, Snowflake validation retry, and fallback critique. |
| 2:45-3:15 | Test optional GCP Vision only if credentials are ready. If not, confirm `screenshot_b64=null` still works XML-only. |
| 3:15-4:00 | Integration with Fatima and Feras. Fix response-shape mismatches, malformed XML edge cases, and cooldown surprises. |

#### GCP Vision Setup (Optional, Do Not Block Core Demo)

```text
1. Go to console.cloud.google.com
2. Create or select the Arch-Enemy project
3. Enable Cloud Vision API
4. IAM -> Service Accounts -> Create service account
5. Download JSON key
6. Save outside git, then set GOOGLE_APPLICATION_CREDENTIALS in backend/.env
```

Vision is a secondary enrichment check. If auth or screenshots fail, the XML parser still provides the core graph structure.

#### Test Command (Standalone)

```bash
# From backend/ directory
python -c "
from services.xml_parser import parse_drawio_xml, graph_to_mermaid
xml = '<mxGraphModel><root><mxCell id=\"0\"/><mxCell id=\"1\"/><mxCell id=\"2\" value=\"FastAPI\" vertex=\"1\"><mxGeometry/></mxCell><mxCell id=\"3\" value=\"PostgreSQL\" vertex=\"1\"><mxGeometry/></mxCell><mxCell id=\"4\" edge=\"1\" source=\"2\" target=\"3\"><mxGeometry/></mxCell></root></mxGraphModel>'
graph = parse_drawio_xml(xml)
print(graph_to_mermaid(graph))
"
```

#### API Test Command

```bash
curl -X POST http://localhost:8000/analyze/ \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"demo\",\"xml\":\"<mxGraphModel><root><mxCell id='0'/><mxCell id='1'/><mxCell id='2' value='API' vertex='1'><mxGeometry/></mxCell><mxCell id='3' value='DB' vertex='1'><mxGeometry/></mxCell><mxCell id='4' edge='1' source='2' target='3'><mxGeometry/></mxCell></root></mxGraphModel>\"}"
```

#### Umar Fallbacks

| Failure | Fallback |
|:--|:--|
| Snowflake not ready | Return `get_fallback_critique()` from `quality_gates.py`. |
| GCP Vision auth fails | Skip Vision and return XML-only labels/metadata. |
| Browser screenshot is missing | Accept `screenshot_b64=null`; continue XML-only. |
| Diffing has demo edge cases | Treat first valid diagram as changed and return Mermaid + critique. |

---

### Fatima - Frontend: draw.io Integration, Analyze API, UI, Audio

**Branch:** `feature/frontend`
**Files owned:** Everything in `frontend/src/`

> The trigger chain is: user edits the embedded draw.io iframe -> `App.jsx` receives `autosave` or `save` XML -> frontend POSTs to `/analyze/` -> UI updates from the response -> frontend sends critique text to `/ws/session` for audio.

#### Hour-by-Hour

| Time | Task |
|:--|:--|
| 0:00-0:30 | Run `npm install` and `npm run dev` in `frontend/`. Set `VITE_API_URL=http://localhost:8000`. Confirm draw.io iframe loads. |
| 0:30-1:00 | Verify draw.io `postMessage` handling in `App.jsx`: `init`, `autosave`, and `save`. Log XML from diagram edits. |
| 1:00-1:45 | Build against a mock analyze response with the real response shape. Render Mermaid, critique, severity, change summary, Vision badge, and highlighted nodes without waiting for backend. |
| 1:45-2:30 | Wire real `analyzeDiagram()`: send `{ session_id, xml, screenshot_b64 }`, keep SHA-256 duplicate skip, keep 5-second cooldown, and send `screenshot_b64=null` if capture fails. |
| 2:30-3:15 | Polish `CritiquePanel.jsx` and `MermaidView.jsx`: typing animation, severity colors, changed-node glow, Vision enrichment note. |
| 3:15-3:45 | Connect TTS: `connectTTSSocket()` on mount and `speakCritique(result.critique)` after analyze returns. Confirm audio chunks play or fail gracefully. |
| 3:45-4:00 | Full demo pass with Umar and Feras. Fix only blockers; no new features. |

#### Analyze Response Shape to Mock

```json
{
  "has_changes": true,
  "change_summary": "Added components: Redis; New connection: API -> Redis",
  "mermaid": "graph TD\n    API[\"API\"] --> Redis[\"Redis\"]",
  "critique": "Redis between API and the database? Finally, a decision that does not make the pager cry. Add eviction policy and metrics before calling it production-ready.",
  "vision_labels": ["API", "Redis"],
  "vision_overlap_score": 1.0,
  "vision_enrichment": ""
}
```

#### draw.io Trigger Reference

```javascript
if ((msg.event === 'autosave' || msg.event === 'save') && msg.xml) {
  await handleXmlChange(msg.xml)
}
```

#### Mermaid Node Highlighting

The backend sends a `change_summary` like:

```text
Added components: MongoDB; New connection: FastAPI -> MongoDB
```

Extract labels from that summary and pass them to `MermaidView.jsx` as `highlightedNodes`. `MermaidView.jsx` renders Mermaid SVG, walks `g.node` and `g.flowchart-label`, and applies the `arch-enemy-highlight` class when labels match.

#### Key Frontend Files

| File | Purpose |
|:--|:--|
| `src/App.jsx` | draw.io iframe, postMessage listener, session state, analyze flow |
| `src/api.js` | `analyzeDiagram()`, `connectTTSSocket()`, `speakCritique()` |
| `src/components/CritiquePanel.jsx` | Severity gauge, critique text, typing animation, Vision note |
| `src/components/MermaidView.jsx` | Mermaid SVG rendering and changed-node highlighting |
| `src/App.css` | Split-panel layout, dark theme, severity colors, highlight styling |

#### Fatima Fallbacks

| Failure | Fallback |
|:--|:--|
| Backend not ready | Use the mock analyze response above. |
| draw.io postMessage is flaky | Add temporary XML textarea/file upload that calls `analyzeDiagram()` directly. |
| Screenshot capture fails | Send `screenshot_b64=null`. |
| TTS fails | Demo text critique + Mermaid + highlights only. |

---

## Integration Checkpoints

| Time | Checkpoint | Owner |
|:--|:--|:--|
| T+0:30 | Backend `/health` works; frontend dev server works; env files filled | All |
| T+1:00 | XML parser and Mermaid conversion work with sample XML | Umar |
| T+1:15 | Mock analyze response renders in frontend | Fatima |
| T+1:30 | Snowflake direct critique test works or fallback is confirmed | Feras |
| T+2:15 | `POST /analyze/` returns full response shape | Umar |
| T+2:45 | ElevenLabs WebSocket streams audio from hardcoded text | Feras |
| T+3:00 | Frontend calls real `/analyze/` from draw.io edit | Fatima + Umar |
| T+3:30 | End-to-end demo: draw.io edit -> analyze -> UI update -> TTS | All |
| T+4:00 | Demo rehearsed and ready to submit | All |

---

## How to Run Everything

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`. Backend runs at `http://localhost:8000`.

---

## Git Workflow

```bash
git checkout -b feature/llm-pipeline      # Feras
git checkout -b feature/vision-pipeline   # Umar
git checkout -b feature/frontend          # Fatima
```

Merge only after the integration checkpoints pass. Avoid broad refactors during the 4-hour window.

---

## Emergency Fallbacks

| Failure | Fallback |
|:--|:--|
| Snowflake down | Use `get_fallback_critique()` from `quality_gates.py`. |
| GCP Vision auth fails | Skip Vision; XML parser has the core structure. |
| ElevenLabs WebSocket fails | Keep text critique and visual demo; optionally use REST TTS later. |
| draw.io postMessage fails | Add XML textarea/file upload and call `analyzeDiagram()` directly. |
| Backend crashes | Restart backend; re-save the diagram to reset in-memory session state. |
| Too much scope | Cut voice Q&A first, then Vision, but keep analyze -> UI -> critique working. |
