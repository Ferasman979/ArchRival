"""
routers/analyze.py
POST /analyze — receives draw.io XML + optional screenshot.
Orchestrates: diff → (GCP Vision if changed) → Mermaid → Snowflake → returns critique.
"""

import base64
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from services.xml_parser import parse_drawio_xml, graph_to_mermaid, DiagramGraph
from services.diff_engine import diff_graphs, DiagramDiff
from services.vision_service import extract_labels_from_screenshot
from services.snowflake_service import get_critique

router = APIRouter()

# In-memory session state (per-process; good enough for hackathon)
# Key: session_id, Value: last DiagramGraph snapshot
_session_state: dict[str, DiagramGraph] = {}


class AnalyzeRequest(BaseModel):
    session_id: str
    xml: str                          # Raw .drawio XML string
    screenshot_b64: Optional[str] = None  # Base64 PNG screenshot (optional)


class AnalyzeResponse(BaseModel):
    has_changes: bool
    change_summary: str
    mermaid: str
    critique: Optional[str] = None    # None when no changes detected
    vision_labels: list[str] = []


@router.post("/", response_model=AnalyzeResponse)
async def analyze_diagram(req: AnalyzeRequest):
    """
    Main analysis endpoint. Called every 2 seconds by the frontend.
    Pipeline:
      1. Parse XML → graph
      2. Diff against previous snapshot
      3. If unchanged → return early (no API calls)
      4. If changed → GCP Vision + Snowflake critique
    """
    try:
        curr_graph = parse_drawio_xml(req.xml)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    prev_graph = _session_state.get(req.session_id)
    diff: DiagramDiff = diff_graphs(prev_graph, curr_graph)

    # Update state regardless
    _session_state[req.session_id] = curr_graph
    mermaid = graph_to_mermaid(curr_graph)

    # Fast path: no changes → no API calls
    if not diff["has_changes"]:
        return AnalyzeResponse(
            has_changes=False,
            change_summary="No changes.",
            mermaid=mermaid,
        )

    # Changed: run GCP Vision (if screenshot provided)
    vision_labels: list[str] = []
    if req.screenshot_b64:
        try:
            image_bytes = base64.b64decode(req.screenshot_b64)
            vision_labels = extract_labels_from_screenshot(image_bytes)
        except Exception as e:
            # Vision failure is non-fatal — degrade gracefully
            vision_labels = []

    # Get sarcastic critique from Snowflake
    try:
        critique = get_critique(
            mermaid_diagram=mermaid,
            change_summary=diff["change_summary"],
            vision_labels=vision_labels,
        )
    except Exception as e:
        critique = f"Even my connection to Snowflake is failing. This architecture is cursed."

    return AnalyzeResponse(
        has_changes=True,
        change_summary=diff["change_summary"],
        mermaid=mermaid,
        critique=critique,
        vision_labels=vision_labels,
    )


@router.delete("/session/{session_id}")
async def clear_session(session_id: str):
    """Reset a session's diagram state (fresh start)."""
    _session_state.pop(session_id, None)
    return {"cleared": True}
