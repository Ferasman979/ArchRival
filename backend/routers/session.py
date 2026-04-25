"""
routers/session.py
Changes in v2:
  - WS /ws/session        — TTS streaming (unchanged)
  - POST /webhook/architecture-query — ElevenLabs client tool webhook
      Rate limit: 5/min per IP
      Gate 4: Relevance guard before hitting Snowflake
"""

import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

from services.elevenlabs_service import stream_tts
from services.snowflake_service import get_critique
from services.quality_gates import is_architecture_relevant, get_canned_offtopic_response

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


# ─── TTS WebSocket (unchanged) ─────────────────────────────────────────────

@router.websocket("/session")
async def tts_websocket(ws: WebSocket):
    """
    Browser connects here on app load.
    Protocol:
      Client → Server: JSON { "text": "critique text" }
      Server → Client: raw binary audio chunks
      Server → Client: JSON { "done": true }
    """
    await ws.accept()
    try:
        while True:
            raw = await ws.receive_text()
            data = json.loads(raw)
            text = data.get("text", "")
            if not text:
                continue
            async for chunk in stream_tts(text):
                await ws.send_bytes(chunk)
            await ws.send_text(json.dumps({"done": True}))
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await ws.send_text(json.dumps({"error": str(e)}))
        except Exception:
            pass


# ─── ElevenLabs Client Tool Webhook ────────────────────────────────────────

class ArchitectureQueryPayload(BaseModel):
    session_id: str
    question: str           # Transcribed user speech from ElevenLabs agent
    diagram_mermaid: str    # Current diagram context injected by frontend


@router.post("/webhook/architecture-query")
@limiter.limit("5/minute")
async def elevenlabs_tool_webhook(request: Request, body: ArchitectureQueryPayload):
    """
    Called by the ElevenLabs Conversational AI agent via its client tool config
    when the user asks an architecture question during a voice conversation.

    Flow:
      User speaks → ElevenLabs STT → agent detects architecture question
      → calls this webhook → Snowflake answers → agent speaks the result

    Gate 4: Relevance guard — off-topic questions never reach Snowflake.
    """
    # Gate 4: Relevance check
    if not is_architecture_relevant(body.question):
        return {"result": get_canned_offtopic_response()}

    # Query Snowflake with user's question + current diagram as context
    try:
        answer = get_critique(
            mermaid_diagram=body.diagram_mermaid,
            change_summary=f"User question: {body.question}",
            vision_labels=[],
            enrichment_note="",
            retry_hint="Answer the user's specific question directly and sarcastically.",
        )
        return {"result": answer}
    except Exception:
        return {"result": "Even my Snowflake connection is failing. This architecture is truly cursed."}
