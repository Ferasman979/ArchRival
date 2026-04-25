"""
watcher.py — Autonomous draw.io file watcher and screenshot capturer.

This script runs permanently alongside the app. It:
  1. Watches the .drawio file for OS-level save events (not polling)
  2. On save: reads XML, hashes it, compares to previous snapshot
  3. If changed: captures a screenshot of just the draw.io window
  4. POSTs XML + screenshot to the FastAPI backend /analyze/ endpoint
  5. Forwards the critique text to the browser via WebSocket

Usage:
    python watcher.py --file "C:/path/to/your/diagram.drawio" --session my-session

Requirements (add to requirements.txt):
    watchdog==4.0.1
    pygetwindow==0.0.9
    Pillow==10.4.0
    httpx==0.27.2
    websockets==13.1
"""

import argparse
import asyncio
import base64
import hashlib
import io
import json
import logging
import os
import sys
import time
from pathlib import Path

import httpx
import websockets
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

try:
    import pygetwindow as gw
    from PIL import ImageGrab
    SCREENSHOT_AVAILABLE = True
except ImportError:
    SCREENSHOT_AVAILABLE = False
    logging.warning("pygetwindow/Pillow not available — screenshots disabled.")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [WATCHER] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
WS_URL = BACKEND_URL.replace("http", "ws") + "/ws/session"

# ─── Screenshot capture ────────────────────────────────────────────────────

def capture_drawio_window() -> bytes | None:
    """
    Find the draw.io Desktop window by title and capture only that window.
    Returns PNG bytes, or None if window not found.
    """
    if not SCREENSHOT_AVAILABLE:
        return None

    # draw.io Desktop window titles vary by OS/version:
    # "draw.io", "diagrams.net", or "<filename> - draw.io"
    target_titles = ["draw.io", "diagrams.net", "drawio"]

    window = None
    for title_fragment in target_titles:
        matches = [w for w in gw.getAllWindows() if title_fragment.lower() in w.title.lower()]
        if matches:
            window = matches[0]
            break

    if window is None:
        log.warning("draw.io window not found — using full screen fallback")
        screenshot = ImageGrab.grab()
    else:
        # Capture only the draw.io window region
        left, top = window.left, window.top
        right, bottom = window.right, window.bottom
        log.info(f"Capturing window: '{window.title}' at ({left},{top}) {right-left}x{bottom-top}")
        screenshot = ImageGrab.grab(bbox=(left, top, right, bottom))

    buf = io.BytesIO()
    screenshot.save(buf, format="PNG")
    return buf.getvalue()


# ─── Backend communication ─────────────────────────────────────────────────

def call_analyze(session_id: str, xml: str, screenshot_bytes: bytes | None) -> dict | None:
    """
    POST to /analyze/ with the XML and optional screenshot.
    Returns the JSON response or None on failure.
    """
    screenshot_b64 = None
    if screenshot_bytes:
        screenshot_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")

    try:
        response = httpx.post(
            f"{BACKEND_URL}/analyze/",
            json={
                "session_id": session_id,
                "xml": xml,
                "screenshot_b64": screenshot_b64,
            },
            timeout=30.0,
        )
        response.raise_for_status()
        return response.json()
    except httpx.HTTPError as e:
        log.error(f"Backend request failed: {e}")
        return None


async def push_critique_to_browser(critique: str):
    """
    Send the critique text to the frontend via WebSocket.
    The frontend's /ws/session endpoint will stream TTS audio back to the browser.
    """
    try:
        async with websockets.connect(WS_URL) as ws:
            await ws.send(json.dumps({"text": critique}))
            # Wait for done signal
            async for message in ws:
                data = json.loads(message)
                if data.get("done"):
                    break
    except Exception as e:
        log.error(f"WebSocket push failed: {e}")


# ─── File event handler ────────────────────────────────────────────────────

class DrawioFileHandler(FileSystemEventHandler):
    """
    Handles filesystem events for a specific .drawio file.
    Uses SHA-256 hashing as the change gate — only processes real content changes.
    """

    def __init__(self, filepath: str, session_id: str):
        self.filepath = os.path.abspath(filepath)
        self.session_id = session_id
        self._last_hash: str | None = None
        self._debounce_time = 0.5   # seconds — ignore duplicate events within window
        self._last_event_time = 0.0

    def on_modified(self, event):
        """Called by watchdog when any file in the watched directory is modified."""
        # Filter: only care about our specific file
        if os.path.abspath(event.src_path) != self.filepath:
            return

        # Debounce: draw.io fires multiple events on a single save
        now = time.monotonic()
        if now - self._last_event_time < self._debounce_time:
            return
        self._last_event_time = now

        self._handle_change()

    def _handle_change(self):
        """Main change handler — runs synchronously in the watchdog thread."""
        try:
            xml = Path(self.filepath).read_text(encoding="utf-8")
        except Exception as e:
            log.error(f"Failed to read file: {e}")
            return

        # Hash check — fast gate before any API calls
        new_hash = hashlib.sha256(xml.encode()).hexdigest()
        if new_hash == self._last_hash:
            log.debug("File touched but content unchanged — skipping.")
            return

        self._last_hash = new_hash
        log.info(f"Change detected in {os.path.basename(self.filepath)}")

        # Capture draw.io window screenshot
        screenshot_bytes = capture_drawio_window()
        if screenshot_bytes:
            log.info(f"Screenshot captured ({len(screenshot_bytes) // 1024} KB)")
        else:
            log.warning("No screenshot — proceeding with XML-only analysis")

        # Call backend
        result = call_analyze(self.session_id, xml, screenshot_bytes)
        if result is None:
            log.error("Backend call failed.")
            return

        if not result.get("has_changes"):
            log.info("Backend confirmed: no architectural changes.")
            return

        critique = result.get("critique", "")
        change_summary = result.get("change_summary", "")
        log.info(f"Change: {change_summary}")
        log.info(f"Critique: {critique}")

        if critique:
            # Push critique to browser for TTS playback
            asyncio.run(push_critique_to_browser(critique))


# ─── Entry point ──────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Arch-Enemy draw.io file watcher")
    parser.add_argument(
        "--file",
        required=True,
        help="Absolute path to the .drawio file to watch",
    )
    parser.add_argument(
        "--session",
        default="default-session",
        help="Session ID (use a UUID for multi-user setups)",
    )
    args = parser.parse_args()

    filepath = os.path.abspath(args.file)
    if not os.path.exists(filepath):
        log.error(f"File not found: {filepath}")
        sys.exit(1)

    log.info(f"Watching: {filepath}")
    log.info(f"Session:  {args.session}")
    log.info(f"Backend:  {BACKEND_URL}")
    log.info("Waiting for changes... (Save your draw.io file to trigger analysis)")

    # Watch the directory containing the file (watchdog works at directory level)
    watch_dir = os.path.dirname(filepath)
    handler = DrawioFileHandler(filepath=filepath, session_id=args.session)

    observer = Observer()
    observer.schedule(handler, path=watch_dir, recursive=False)
    observer.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        log.info("Stopping watcher...")
        observer.stop()

    observer.join()
    log.info("Watcher stopped.")


if __name__ == "__main__":
    main()
