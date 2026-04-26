"""
routers/analyze.py
POST /analyze — receives draw.io XML + optional screenshot.
Orchestrates: diff → (GCP Vision if changed) → Mermaid → Snowflake → returns critique.
"""

import base64
import time
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from typing import Optional

from services.xml_parser import parse_drawio_xml, graph_to_mermaid, DiagramGraph
from services.diff_engine import diff_graphs, DiagramDiff
from services.vision_service import extract_labels_from_screenshot
from services.snowflake_service import get_critique
from services.quality_gates import (
    validate_xml,
    compute_vision_overlap,
    validate_critique,
    get_fallback_critique,
    compute_severity,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

SESSION_COOLDOWN_SECONDS = 5.0

# Key: session_id → last DiagramGraph snapshot
_session_graphs: dict[str, DiagramGraph] = {}
# Key: session_id → unix timestamp of last successful analysis
_session_cooldowns: dict[str, float] = {}


class AnalyzeRequest(BaseModel):
    session_id: str
    xml: str
    screenshot_b64: Optional[str] = None


class AnalyzeResponse(BaseModel):
    has_changes: bool
    change_summary: str
    mermaid: str
    critique: Optional[str] = None
    severity: str = "warning"
    vision_labels: list[str] = []
    vision_overlap_score: float = 0.0
    vision_enrichment: str = ""


@router.post("/", response_model=AnalyzeResponse)
@limiter.limit("10/minute")
async def analyze_diagram(request: Request, req: AnalyzeRequest):
    # Gate 1: validate XML before touching any API
    valid, reason = validate_xml(req.xml)
    if not valid:
        raise HTTPException(status_code=400, detail=reason)

    try:
        curr_graph = parse_drawio_xml(req.xml)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    mermaid = graph_to_mermaid(curr_graph)
    prev_graph = _session_graphs.get(req.session_id)
    diff: DiagramDiff = diff_graphs(prev_graph, curr_graph)

    _session_graphs[req.session_id] = curr_graph

    # Fast path: no structural changes
    if not diff["has_changes"]:
        return AnalyzeResponse(
            has_changes=False,
            change_summary="No changes.",
            mermaid=mermaid,
        )

    # Per-session cooldown: don't hammer APIs on rapid saves
    last_run = _session_cooldowns.get(req.session_id, 0.0)
    if time.time() - last_run < SESSION_COOLDOWN_SECONDS:
        return AnalyzeResponse(
            has_changes=False,
            change_summary="No changes.",
            mermaid=mermaid,
        )

    _session_cooldowns[req.session_id] = time.time()

    # GCP Vision (optional — non-fatal if missing or failing)
    vision_labels: list[str] = []
    if req.screenshot_b64:
        try:
            image_bytes = base64.b64decode(req.screenshot_b64)
            vision_labels = extract_labels_from_screenshot(image_bytes)
        except Exception:
            vision_labels = []

    # Gate 2: cross-validate Vision labels against XML labels
    xml_labels = [n["label"] for n in curr_graph["nodes"].values()]
    overlap_score, enrichment = compute_vision_overlap(xml_labels, vision_labels)

    # Snowflake critique with Gate 3 validation + one retry
    critique = _get_validated_critique(
        mermaid=mermaid,
        change_summary=diff["change_summary"],
        vision_labels=vision_labels,
        enrichment_note=enrichment,
        component_labels=xml_labels,
    )

    return AnalyzeResponse(
        has_changes=True,
        change_summary=diff["change_summary"],
        mermaid=mermaid,
        critique=critique,
        severity=compute_severity(critique),
        vision_labels=vision_labels,
        vision_overlap_score=overlap_score,
        vision_enrichment=enrichment,
    )


def _get_validated_critique(
    mermaid: str,
    change_summary: str,
    vision_labels: list[str],
    enrichment_note: str,
    component_labels: list[str],
) -> str:
    for attempt in range(2):
        retry_hint = "" if attempt == 0 else f"Previous response was rejected. {_last_hint}"
        try:
            critique = get_critique(
                mermaid_diagram=mermaid,
                change_summary=change_summary,
                vision_labels=vision_labels,
                enrichment_note=enrichment_note,
                retry_hint=retry_hint,
            )
        except Exception:
            return get_fallback_critique()

        valid, hint = validate_critique(critique, component_labels)
        if valid:
            return critique
        # Store hint for the retry
        globals()["_last_hint"] = hint

    return get_fallback_critique()


_last_hint: str = ""


@router.delete("/session/{session_id}")
async def clear_session(session_id: str):
    _session_graphs.pop(session_id, None)
    _session_cooldowns.pop(session_id, None)
    return {"cleared": True}
