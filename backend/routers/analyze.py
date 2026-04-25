"""
routers/analyze.py — Main analysis endpoint.
Changes in v2:
  - Rate limit: 10 requests/min per session (via slowapi)
  - Gate 1: XML validation before any API call
  - Gate 2: GCP Vision cross-validation with overlap scoring
  - Gate 3: Snowflake response validation + retry + fallback
  - 5-second cooldown enforced server-side per session
"""

import base64
import time
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from slowapi import Limiter
from slowapi.util import get_remote_address

from services.xml_parser import parse_drawio_xml, graph_to_mermaid, DiagramGraph
from services.diff_engine import diff_graphs
from services.vision_service import extract_labels_from_screenshot
from services.snowflake_service import get_critique
from services.quality_gates import (
    validate_drawio_xml,
    cross_validate_labels,
    validate_critique_response,
    get_fallback_critique,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

_session_state: dict[str, DiagramGraph] = {}
_session_cooldown: dict[str, float] = {}  # session_id → last_analysis_timestamp
COOLDOWN_SECONDS = 5.0
MAX_RETRIES = 2


class AnalyzeRequest(BaseModel):
    session_id: str
    xml: str
    screenshot_b64: Optional[str] = None


class AnalyzeResponse(BaseModel):
    has_changes: bool
    change_summary: str
    mermaid: str
    critique: Optional[str] = None
    vision_labels: list[str] = []
    vision_overlap_score: float = 1.0
    vision_enrichment: str = ""


@router.post("/", response_model=AnalyzeResponse)
@limiter.limit("10/minute")
async def analyze_diagram(request: Request, req: AnalyzeRequest):

    # ── Server-side 5s cooldown per session ──────────────────────────
    now = time.monotonic()
    last = _session_cooldown.get(req.session_id, 0.0)
    if now - last < COOLDOWN_SECONDS:
        # Return current state silently — don't 429, just skip
        curr = _session_state.get(req.session_id)
        mermaid = mermaid_from_graph(curr)
        return AnalyzeResponse(has_changes=False, change_summary="Cooldown active.", mermaid=mermaid)

    # ── Gate 1: XML validation ────────────────────────────────────────
    is_valid, err = validate_drawio_xml(req.xml)
    if not is_valid:
        raise HTTPException(status_code=422, detail=f"Invalid diagram: {err}")

    # ── Parse + diff ──────────────────────────────────────────────────
    try:
        curr_graph = parse_drawio_xml(req.xml)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    prev_graph = _session_state.get(req.session_id)
    diff = diff_graphs(prev_graph, curr_graph)
    _session_state[req.session_id] = curr_graph
    mermaid = graph_to_mermaid(curr_graph)

    if not diff["has_changes"]:
        return AnalyzeResponse(has_changes=False, change_summary="No changes.", mermaid=mermaid)

    # ── Gate 2: GCP Vision cross-validation ──────────────────────────
    xml_labels = [n["label"] for n in curr_graph["nodes"].values() if n["label"]]
    vision_labels: list[str] = []
    cross_val = {
        "merged_labels": xml_labels,
        "overlap_score": 1.0,
        "enrichment_note": "",
        "vision_trustworthy": True,
    }

    if req.screenshot_b64:
        try:
            image_bytes = base64.b64decode(req.screenshot_b64)
            vision_labels = extract_labels_from_screenshot(image_bytes)
            cross_val = cross_validate_labels(xml_labels, vision_labels)
        except Exception:
            pass  # Vision failure is non-fatal — degrade gracefully

    # ── Gate 3: Snowflake + response validation with retry ────────────
    component_names = xml_labels
    critique = None

    for attempt in range(MAX_RETRIES + 1):
        retry_hint = (
            "Be sure to explicitly mention at least one component name from the diagram."
            if attempt > 0 else ""
        )
        try:
            raw = get_critique(
                mermaid_diagram=mermaid,
                change_summary=diff["change_summary"],
                vision_labels=cross_val["merged_labels"],
                enrichment_note=cross_val.get("enrichment_note", ""),
                retry_hint=retry_hint,
            )
            ok, _ = validate_critique_response(raw, component_names)
            if ok:
                critique = raw
                break
        except Exception:
            break

    if critique is None:
        critique = get_fallback_critique()

    # Update cooldown timestamp only after a real analysis
    _session_cooldown[req.session_id] = time.monotonic()

    return AnalyzeResponse(
        has_changes=True,
        change_summary=diff["change_summary"],
        mermaid=mermaid,
        critique=critique,
        vision_labels=vision_labels,
        vision_overlap_score=cross_val.get("overlap_score", 1.0),
        vision_enrichment=cross_val.get("enrichment_note", ""),
    )


@router.delete("/session/{session_id}")
async def clear_session(session_id: str):
    _session_state.pop(session_id, None)
    _session_cooldown.pop(session_id, None)
    return {"cleared": True}


def mermaid_from_graph(graph: Optional[DiagramGraph]) -> str:
    if graph is None:
        return "graph TD\n    A[Start drawing your architecture]"
    return graph_to_mermaid(graph)
