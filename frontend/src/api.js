/**
 * api.js — All backend communication in one place.
 * Person C owns this file and all components import from here.
 * Backend base URL is set via VITE_API_URL env variable.
 */

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

let _ttsSocket = null;
let _audioQueue = [];
let _isPlaying = false;

// ─── REST: Analyze diagram ─────────────────────────────────────────────────

/**
 * Send the current draw.io XML (+ optional screenshot) to the backend.
 * @param {string} sessionId  - UUID for this session
 * @param {string} xml        - Raw .drawio XML string
 * @param {string|null} screenshotB64 - Base64 PNG (optional)
 * @returns {Promise<AnalyzeResponse>}
 */
export async function analyzeDiagram(sessionId, xml, screenshotB64 = null) {
  const res = await fetch(`${API_BASE}/analyze/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      xml,
      screenshot_b64: screenshotB64,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `API error ${res.status}`);
  }

  return res.json();
}

/**
 * Reset session state on the backend (fresh diagram).
 */
export async function clearSession(sessionId) {
  await fetch(`${API_BASE}/analyze/session/${sessionId}`, {
    method: "DELETE",
  });
}

// ─── WebSocket: TTS audio streaming ───────────────────────────────────────

/**
 * Connect to the TTS WebSocket. Call once on app mount.
 * Audio chunks are played automatically via the AudioContext queue.
 */
export function connectTTSSocket() {
  const wsUrl = API_BASE.replace("http", "ws") + "/ws/session";
  _ttsSocket = new WebSocket(wsUrl);
  _ttsSocket.binaryType = "arraybuffer";

  _ttsSocket.onmessage = async (event) => {
    if (event.data instanceof ArrayBuffer) {
      // Raw audio chunk — add to queue and play
      _audioQueue.push(event.data);
      if (!_isPlaying) _playNextChunk();
    } else {
      const data = JSON.parse(event.data);
      if (data.done) {
        // TTS complete
      }
    }
  };

  _ttsSocket.onerror = (e) => console.error("TTS WebSocket error", e);
}

/**
 * Send critique text to the backend for TTS synthesis.
 * @param {string} text - Critique text to speak
 */
export function speakCritique(text) {
  if (_ttsSocket?.readyState === WebSocket.OPEN) {
    _ttsSocket.send(JSON.stringify({ text }));
  }
}

// ─── Audio playback queue ──────────────────────────────────────────────────

const _audioCtx = new (window.AudioContext || window.webkitAudioContext)();

async function _playNextChunk() {
  if (_audioQueue.length === 0) {
    _isPlaying = false;
    return;
  }

  _isPlaying = true;
  const chunk = _audioQueue.shift();

  try {
    const buffer = await _audioCtx.decodeAudioData(chunk.slice(0));
    const source = _audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(_audioCtx.destination);
    source.onended = _playNextChunk;
    source.start();
  } catch {
    // Invalid chunk (header/footer) — skip and continue
    _playNextChunk();
  }
}
