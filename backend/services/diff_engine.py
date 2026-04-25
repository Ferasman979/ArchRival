"""
services/diff_engine.py
Compares two DiagramGraph snapshots and returns what changed.
This is the gate: GCP Vision is ONLY called if this returns changes.
"""

from services.xml_parser import DiagramGraph
from typing import TypedDict


class DiagramDiff(TypedDict):
    has_changes: bool
    added_nodes: list[str]      # labels of new nodes
    removed_nodes: list[str]    # labels of removed nodes
    added_edges: list[dict]     # new connections
    removed_edges: list[dict]   # removed connections
    change_summary: str         # human-readable one-liner for prompt context


def diff_graphs(prev: DiagramGraph | None, curr: DiagramGraph) -> DiagramDiff:
    """
    Compare previous and current diagram graphs.
    Returns a DiagramDiff describing exactly what changed.
    """
    # Fast path: identical hash = no changes
    if prev and prev["hash"] == curr["hash"]:
        return DiagramDiff(
            has_changes=False,
            added_nodes=[],
            removed_nodes=[],
            added_edges=[],
            removed_edges=[],
            change_summary="No changes detected.",
        )

    prev_nodes = prev["nodes"] if prev else {}
    curr_nodes = curr["nodes"]
    prev_edges = prev["edges"] if prev else []
    curr_edges = curr["edges"]

    # Node changes
    prev_ids = set(prev_nodes.keys())
    curr_ids = set(curr_nodes.keys())

    added_node_labels = [
        curr_nodes[nid]["label"] or nid for nid in (curr_ids - prev_ids)
    ]
    removed_node_labels = [
        prev_nodes[nid]["label"] or nid for nid in (prev_ids - curr_ids)
    ]

    # Edge changes (compare as source->target pairs)
    def edge_key(e: dict) -> tuple:
        return (e["source"], e["target"], e["label"])

    prev_edge_keys = {edge_key(e) for e in prev_edges}
    curr_edge_keys = {edge_key(e) for e in curr_edges}

    added_edges = [
        e for e in curr_edges if edge_key(e) not in prev_edge_keys
    ]
    removed_edges = [
        e for e in prev_edges if edge_key(e) not in curr_edge_keys
    ]

    has_changes = bool(
        added_node_labels or removed_node_labels or added_edges or removed_edges
    )

    # Build a natural-language summary for the LLM prompt
    parts = []
    if added_node_labels:
        parts.append(f"Added components: {', '.join(added_node_labels)}")
    if removed_node_labels:
        parts.append(f"Removed components: {', '.join(removed_node_labels)}")
    if added_edges:
        for e in added_edges:
            src_label = curr_nodes.get(e["source"], {}).get("label", e["source"])
            tgt_label = curr_nodes.get(e["target"], {}).get("label", e["target"])
            parts.append(f"New connection: {src_label} → {tgt_label}")
    if removed_edges:
        for e in removed_edges:
            src_label = prev_nodes.get(e["source"], {}).get("label", e["source"])
            tgt_label = prev_nodes.get(e["target"], {}).get("label", e["target"])
            parts.append(f"Removed connection: {src_label} → {tgt_label}")

    change_summary = "; ".join(parts) if parts else "Minor structural change."

    return DiagramDiff(
        has_changes=has_changes,
        added_nodes=added_node_labels,
        removed_nodes=removed_node_labels,
        added_edges=added_edges,
        removed_edges=removed_edges,
        change_summary=change_summary,
    )
