"""
routers/session.py
WebSocket /ws/session — streams TTS audio bytes back to frontend.
Frontend sends critique text → backend streams audio chunks.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from services.elevenlabs_service import stream_tts
import json

router = APIRouter()


@router.websocket("/session")
async def tts_websocket(ws: WebSocket):
    """
    WebSocket endpoint for streaming TTS audio.
    
    Protocol:
      Client → Server: JSON { "text": "critique string here" }
      Server → Client: raw audio bytes (chunked, play as they arrive)
      Server → Client: JSON { "done": true } when finished
    """
    await ws.accept()

    try:
        while True:
            raw = await ws.receive_text()
            data = json.loads(raw)
            text = data.get("text", "")

            if not text:
                continue

            # Stream audio chunks to client
            async for audio_chunk in stream_tts(text):
                await ws.send_bytes(audio_chunk)

            # Signal completion
            await ws.send_text(json.dumps({"done": True}))

    except WebSocketDisconnect:
        pass
    except Exception as e:
        await ws.send_text(json.dumps({"error": str(e)}))
