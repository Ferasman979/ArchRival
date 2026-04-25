"""
main.py — FastAPI entry point with slowapi rate limiting.
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from dotenv import load_dotenv
import os

load_dotenv()

from routers import analyze, session

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="Arch-Enemy API", version="2.0.0")

# Rate limiter state + handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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
    return {"status": "ok", "version": "2.0.0"}
