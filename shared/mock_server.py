"""
Mock backend for frontend development.
Run this if you don't have Snowflake/GCP keys yet.
Returns realistic fake responses so Person C can build UI independently.

Usage: python mock_server.py
"""

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json

app = FastAPI(title="Arch-Enemy Mock Server")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

MOCK_CRITIQUES = [
    "Oh wonderful, you've connected your API directly to the database with zero caching layer. I'm sure that'll hold up beautifully under load. Add Redis between them — your database will thank you.",
    "A load balancer! You actually added a load balancer. I'm genuinely shocked. Now add health checks to it and we might survive a real traffic spike.",
    "Two databases. You added two databases with no explanation. MongoDB AND PostgreSQL? Pick one identity crisis and commit to it. Or at least justify the polyglot persistence.",
    "A message queue! Finally, someone who understands decoupling. This architecture might actually survive a Monday morning. Add a dead-letter queue and I'll be almost impressed.",
    "You removed the cache. You. Removed. The. Cache. I need a moment. Add it back, set a TTL, and never do that again.",
]

_critique_index = 0
_call_count = 0


@app.post("/analyze/")
async def mock_analyze(body: dict):
    global _critique_index, _call_count
    _call_count += 1

    # Simulate no-change response 60% of the time
    if _call_count % 5 != 0:
        return {
            "has_changes": False,
            "change_summary": "No changes.",
            "mermaid": "graph TD\n    A[\"Your diagram\"] --> B[\"will appear here\"]",
            "critique": None,
            "vision_labels": [],
        }

    critique = MOCK_CRITIQUES[_critique_index % len(MOCK_CRITIQUES)]
    _critique_index += 1

    return {
        "has_changes": True,
        "change_summary": "Added new component",
        "mermaid": "graph TD\n    API[\"FastAPI\"] --> DB[\"PostgreSQL\"]\n    API --> Cache[\"Redis\"]",
        "critique": critique,
        "vision_labels": ["FastAPI", "PostgreSQL", "Redis"],
    }


@app.delete("/analyze/session/{session_id}")
async def mock_clear(session_id: str):
    return {"cleared": True}


@app.websocket("/ws/session")
async def mock_tts(ws: WebSocket):
    await ws.accept()
    while True:
        data = json.loads(await ws.receive_text())
        # Simulate sending a few audio chunks then done
        for _ in range(3):
            await asyncio.sleep(0.1)
            await ws.send_bytes(b"\x00" * 100)  # fake audio
        await ws.send_text(json.dumps({"done": True}))


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
