"""
main.py — FastAPI entry point for Arch-Enemy backend.
Exposes:
  POST /analyze      — receives draw.io XML + screenshot, returns critique
  WS   /ws/session   — WebSocket for real-time streaming critique
  GET  /health       — health check
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

load_dotenv()

from routers import analyze, session

app = FastAPI(title="Arch-Enemy API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("CORS_ORIGIN", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router, prefix="/analyze", tags=["analyze"])
app.include_router(session.router, prefix="/ws", tags=["websocket"])


@app.get("/health")
async def health():
    return {"status": "ok"}
