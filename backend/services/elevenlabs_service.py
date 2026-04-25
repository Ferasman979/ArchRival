"""
services/elevenlabs_service.py
Streams TTS from ElevenLabs using WebSocket for minimum perceived latency.
Uses sentence-level chunking: audio starts playing before full text is ready.
"""

import os
import asyncio
import websockets
import json
from typing import AsyncGenerator


ELEVENLABS_WS_URL = "wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input?model_id=eleven_flash_v2_5&optimize_streaming_latency=4"


async def stream_tts(text: str) -> AsyncGenerator[bytes, None]:
    """
    Stream TTS audio from ElevenLabs via WebSocket.
    Yields audio chunks as bytes as soon as they arrive.
    Uses eleven_flash_v2_5 for minimum latency.
    """
    api_key = os.getenv("ELEVENLABS_API_KEY")
    voice_id = os.getenv("ELEVENLABS_VOICE_ID")

    url = ELEVENLABS_WS_URL.format(voice_id=voice_id)

    # ✅ Key sent in WS upgrade header — NOT in the JSON body.
    # Sending it in the body exposes it in browser/proxy frame inspectors.
    async with websockets.connect(url, extra_headers={"xi-api-key": api_key}) as ws:
        # Send initial config (no key here)
        await ws.send(json.dumps({
            "text": " ",
            "voice_settings": {
                "stability": 0.4,        # Lower = more expressive/emotional
                "similarity_boost": 0.8,
                "style": 0.6,            # Adds personality
                "use_speaker_boost": True,
            },
        }))

        # Send text in sentence-level chunks for faster first-audio
        sentences = _split_into_sentences(text)
        for sentence in sentences:
            await ws.send(json.dumps({"text": sentence + " "}))

        # Signal end of input
        await ws.send(json.dumps({"text": ""}))

        # Yield audio chunks as they arrive
        async for message in ws:
            data = json.loads(message)
            if data.get("audio"):
                import base64
                yield base64.b64decode(data["audio"])
            if data.get("isFinal"):
                break


def _split_into_sentences(text: str) -> list[str]:
    """Split text into sentences for chunked streaming."""
    import re
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    return [s for s in sentences if s]


async def get_tts_bytes(text: str) -> bytes:
    """
    Collect all TTS audio chunks into a single bytes object.
    Use this for the REST endpoint; use stream_tts for WebSocket.
    """
    chunks = []
    async for chunk in stream_tts(text):
        chunks.append(chunk)
    return b"".join(chunks)
